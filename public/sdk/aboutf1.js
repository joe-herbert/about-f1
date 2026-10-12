// `import { hooks, ui, lib, registerWidget } from 'aboutf1'` in a plugin. See WIDGETS.md.
const sdk = globalThis.AboutF1
export default sdk
export const { version, React, registerWidget, categories, defaultOptions, hooks, ui, lib } = sdk
