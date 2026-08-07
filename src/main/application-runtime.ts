import pLimit from 'p-limit';
import type { CommandRecord } from '../shared/contracts';
import { CommandRunner } from './commands';

type AsyncOperation<T> = () => Promise<T>;
type CommandUpdateSubscriber = (record: CommandRecord) => void;

interface ApplicationRuntimeOptions {
  commandRunner?: CommandRunner;
  onBackgroundError?: (message: string, error: unknown) => void;
  onCommandSubscriberError?: (error: unknown) => void;
}

/**
 * Owns coordination whose capacity and safety guarantees apply to the whole process.
 * Main creates one instance; tests may create isolated instances or inject a stub runner.
 */
export class ApplicationRuntime {
  static readonly maximumConcurrentBackgroundCommands = Math.max(
    1,
    Math.floor(CommandRunner.maximumConcurrentCommands / 2),
  );
  static readonly maximumConcurrentRepositoryRefreshes = Math.max(
    1,
    Math.floor(CommandRunner.maximumConcurrentCommands / 2),
  );

  readonly commandRunner: CommandRunner;
  readonly #backgroundCommandsLimit = pLimit(
    ApplicationRuntime.maximumConcurrentBackgroundCommands,
  );
  readonly #repositoryRefreshLimit = pLimit(
    ApplicationRuntime.maximumConcurrentRepositoryRefreshes,
  );
  readonly #repositoryMutationLimits = new Map<string, ReturnType<typeof pLimit>>();
  readonly #commandUpdateSubscribers = new Set<CommandUpdateSubscriber>();
  readonly #onBackgroundError: (message: string, error: unknown) => void;
  readonly #onCommandSubscriberError: (error: unknown) => void;

  constructor(options: ApplicationRuntimeOptions = {}) {
    this.#onBackgroundError =
      options.onBackgroundError ?? ((message, error) => console.error(message, error));
    this.#onCommandSubscriberError =
      options.onCommandSubscriberError ??
      ((error) => console.error('Failed to publish command update.', error));
    this.commandRunner =
      options.commandRunner ??
      new CommandRunner((record) => this.#publishCommandUpdate(record));
  }

  runBackgroundCommand<T>(operation: AsyncOperation<T>): Promise<T> {
    return this.#backgroundCommandsLimit(operation);
  }

  runRepositoryRefresh<T>(operation: AsyncOperation<T>): Promise<T> {
    return this.#repositoryRefreshLimit(operation);
  }

  runRepositoryMutation<T>(
    canonicalRepositoryKey: string,
    operation: AsyncOperation<T>,
  ): Promise<T> {
    if (!canonicalRepositoryKey) {
      return Promise.reject(new Error('A canonical repository key is required.'));
    }
    let limit = this.#repositoryMutationLimits.get(canonicalRepositoryKey);
    if (!limit) {
      limit = pLimit(1);
      this.#repositoryMutationLimits.set(canonicalRepositoryKey, limit);
    }
    const result = limit(operation);
    return result.finally(() => {
      if (
        limit.activeCount === 0 &&
        limit.pendingCount === 0 &&
        this.#repositoryMutationLimits.get(canonicalRepositoryKey) === limit
      ) {
        this.#repositoryMutationLimits.delete(canonicalRepositoryKey);
      }
    });
  }

  observeBackgroundTask(operation: AsyncOperation<unknown>, message: string): void {
    void Promise.resolve()
      .then(operation)
      .catch((error: unknown) => this.#onBackgroundError(message, error));
  }

  subscribeToCommandUpdates(subscriber: CommandUpdateSubscriber): () => void {
    this.#commandUpdateSubscribers.add(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#commandUpdateSubscribers.delete(subscriber);
    };
  }

  #publishCommandUpdate(record: CommandRecord): void {
    for (const subscriber of this.#commandUpdateSubscribers) {
      try {
        subscriber(structuredClone(record));
      } catch (error) {
        this.#onCommandSubscriberError(error);
      }
    }
  }
}
