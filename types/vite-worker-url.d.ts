/** Vite bundles a worker entry and hands back its URL (`?worker&url`). */
declare module '*?worker&url' {
  const url: string;
  export default url;
}
