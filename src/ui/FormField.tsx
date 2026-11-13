import type {InputHTMLAttributes,TextareaHTMLAttributes,SelectHTMLAttributes,ReactNode} from 'react'
export function FormField({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label>{label}{children}{hint&&<small>{hint}</small>}</label>}
export function TextInput(props:InputHTMLAttributes<HTMLInputElement>){return <input {...props}/>}
export function TextArea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea {...props}/>}
export function Select(props:SelectHTMLAttributes<HTMLSelectElement>){return <select {...props}/>}
