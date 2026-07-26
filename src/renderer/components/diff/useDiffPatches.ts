import { useCallback, useRef, useState } from 'react';
import type { DiffFilePatch, DiffFileSummary } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';

export function useDiffPatches(sessionId: string): {
  patches: Map<string, DiffFilePatch>;
  loading: Set<string>;
  fileErrors: Map<string, string>;
  requestPatch: (file: DiffFileSummary) => void;
} {
  const requestedFiles = useRef(new Set<string>());
  const [patches, setPatches] = useState<Map<string, DiffFilePatch>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [fileErrors, setFileErrors] = useState<Map<string, string>>(new Map());

  const requestPatch = useCallback(
    (file: DiffFileSummary): void => {
      if (requestedFiles.current.has(file.id)) return;
      requestedFiles.current.add(file.id);
      setLoading((current) => new Set(current).add(file.id));
      void api
        .getDiffFile({ sessionId, fileId: file.id })
        .then((patch) => {
          setPatches((current) => new Map(current).set(file.id, patch));
        })
        .catch((caught: unknown) => {
          setFileErrors((current) =>
            new Map(current).set(file.id, friendlyError(caught)),
          );
        })
        .finally(() => {
          setLoading((current) => {
            const next = new Set(current);
            next.delete(file.id);
            return next;
          });
        });
    },
    [sessionId],
  );

  return { patches, loading, fileErrors, requestPatch };
}
