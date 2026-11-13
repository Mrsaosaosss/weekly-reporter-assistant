import type {ReactNode} from 'react'
export function Card({children,title,subtitle,action,className=''}:{children?:ReactNode;title?:string;subtitle?:string;action?:ReactNode;className?:string}){return <section className={`card ${className}`}>{title&&<header className="card-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>}{children}</section>}
