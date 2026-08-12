---
name: writing-renderer-code
description: 'Write idiomatic code for the renderer. Use when editing React component and hook files, and helpers used by the renderer or reviewing changes in them.'
---

## TypeScript

As a general rule: Infer internally, specify at boundaries.

Don't use `any` or `unknown` when the concrete type is known.

## React

Use modern React features - anything available in React 19. Avoid using old workarounds for problems with modern solutions.

### Examples

1. Stale callback avoidance.

To avoid stale callbacks in hooks use:

```typescript
const onErrorEvent = useEffectEvent(onError);
```

Never deprecated workarounds like:

```typescript
const onErrorRef = useRef(onError);
useEffect(() => {
  onErrorRef.current = onError;
}, [onError]);
```

**NOTE**: Don't use useEffectEvent wrapped callbacks from regular event handlers.
