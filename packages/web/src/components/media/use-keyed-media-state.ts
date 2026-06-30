import { useCallback, useRef, useState } from "react"

type KeyedMediaState<T> = {
  key: unknown
  value: T
}

export function useKeyedMediaState<T>(
  key: unknown,
  initialValue: T,
): readonly [T, (value: T) => void] {
  const [snapshot, setSnapshot] = useState<KeyedMediaState<T>>({
    key,
    value: initialValue,
  })
  const currentKeyRef = useRef(key)
  currentKeyRef.current = key
  const value = Object.is(snapshot.key, key) ? snapshot.value : initialValue
  const setValue = useCallback(
    (nextValue: T) => {
      if (!Object.is(currentKeyRef.current, key)) {
        return
      }
      setSnapshot({
        key,
        value: nextValue,
      })
    },
    [key],
  )

  return [value, setValue] as const
}
