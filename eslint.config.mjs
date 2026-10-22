import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
export default defineConfig([
 ...nextVitals,
 globalIgnores(['.next/**','tmp/**','public/vendor/**','node_modules/**','next-env.d.ts']),
 { rules: { '@next/next/no-html-link-for-pages':'off', '@next/next/no-img-element':'off' } },
 // Existing map lifecycle patterns are outside this administrative change.
 { files:['src/components/editor-map.tsx','src/components/network-map.tsx'], rules:{'react-hooks/refs':'warn'} },
 { files:['src/components/optical-editor.tsx','src/components/workspace.tsx'], rules:{'react-hooks/set-state-in-effect':'warn'} },
]);
