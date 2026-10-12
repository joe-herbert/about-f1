// Lets plugins `import { useState } from 'react'` and share the app's React (see the import map in index.html).
const React = globalThis.AboutF1.React
export default React
export const {
  Activity, Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
  cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, use,
  useActionState, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useEffectEvent, useId,
  useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef, useState,
  useSyncExternalStore, useTransition, version,
} = React
