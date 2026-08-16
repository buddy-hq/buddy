import { useCallback, useRef, useState } from "react"

type TKeyedMediaSnapshot<TValue, TKey> = {
  key: TKey
  value: TValue
}

type TMediaStateKey = string | number | boolean | bigint | symbol | null | undefined | object

export function useKeyedMediaState<TValue, TKey = TMediaStateKey>(
  key: TKey,
  initialValue: TValue,
): readonly [TValue, (value: TValue) => void] {
  const [snapshot, setSnapshot] = useState<TKeyedMediaSnapshot<TValue, TKey>>({
    key,
    value: initialValue,
  })
  const currentKeyRef = useRef(key)
  currentKeyRef.current = key
  const value = Object.is(snapshot.key, key) ? snapshot.value : initialValue
  const setValue = useCallback(
    (nextValue: TValue) => {
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
