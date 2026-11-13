import type {IncomingMessage} from 'node:http'
export function requestAllowed(headers:{host?:string;origin?:string}){return headers.host==='localhost:5188'&&headers.origin==='http://localhost:5188'}
export async function readJson(req:IncomingMessage,limit=120000){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>limit)throw new Error('请求内容过大');chunks.push(b)}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown}
