import type {ReactNode} from 'react'
export function DataTable({caption,children}:{caption:string;children:ReactNode}){return <div className="table-scroll" tabIndex={0}><table><caption>{caption}</caption>{children}</table></div>}
