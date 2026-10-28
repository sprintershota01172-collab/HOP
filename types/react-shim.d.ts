/**
 * この環境では @types/react を取得できないため、使用する API だけを最小限に型付けする。
 * （コンポーネントの props は各ファイルの型で検査される）
 */
declare module 'react' {
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNode[];
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: string | null;
  }
  export type FC<P = Record<string, unknown>> = (props: P & { children?: ReactNode }) => ReactElement | null;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface MutableRefObject<T> {
    current: T;
  }
  export interface RefObject<T> {
    readonly current: T | null;
  }
  export interface Context<T> {
    Provider: FC<{ value: T; children?: ReactNode }>;
  }
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T>;
  export function useContext<T>(ctx: Context<T>): T;
  export function useId(): string;
  export function createContext<T>(value: T): Context<T>;
  export function memo<P>(c: FC<P>): FC<P>;
  export const Fragment: unique symbol;
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): ReactElement;
  const React: {
    createElement: typeof createElement;
    Fragment: typeof Fragment;
  };
  export default React;
}

declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: unknown): void };
}

declare namespace JSX {
  type Element = import('react').ReactElement;
  interface ElementChildrenAttribute {
    children: unknown;
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
  }
  interface IntrinsicElements {
    [name: string]: Record<string, unknown>;
  }
}
