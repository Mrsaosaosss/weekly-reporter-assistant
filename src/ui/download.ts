export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
export function bytesBlob(bytes:Uint8Array,type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){return new Blob([Uint8Array.from(bytes).buffer],{type})}
