import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) {
            return 'recharts'
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-is')
          ) {
            return 'react-vendor'
          }
          if (
            id.includes('/src/lib/ifra_combined_package.js') ||
            id.includes('/src/data/material_normalization.json') ||
            id.includes('/src/data/supplier_product_registry.json') ||
            id.includes('/src/data/supplier_import_review_queue.json') ||
            id.includes('/src/data/source_document_registry.json') ||
            id.includes('/src/data/evidence_candidate_registry.json')
          ) {
            return 'ifra-runtime'
          }
          if (
            id.includes('/src/lib/perfumer_runtime_helpers.js') ||
            id.includes('/src/lib/formula_runtime_helpers.js') ||
            id.includes('/src/lib/browser_storage.js')
          ) {
            return 'app-runtime'
          }
        },
      },
    },
  },
})
