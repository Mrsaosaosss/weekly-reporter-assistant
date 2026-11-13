import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {snapshotPlugin} from './server/localSnapshots'
export default defineConfig(()=>({plugins:[react(),snapshotPlugin()],server:{host:'localhost',port:5188,strictPort:true},preview:{host:'localhost',port:5188,strictPort:true}}))
