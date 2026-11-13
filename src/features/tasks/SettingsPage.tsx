import {useEffect,useState} from 'react'
import {Card} from '../../ui/Card'
import {Button} from '../../ui/Button'
export function SettingsPage(){
 const [status,setStatus]=useState<{configured:boolean;model:string}>(),[result,setResult]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{fetch('/api/status').then(r=>r.json()).then(setStatus).catch(()=>setResult('本机服务未连接'))},[])
 return <><div className="page-heading"><div><div className="eyebrow">AI CONNECTION</div><h1>DeepSeek 接入</h1><p>材料在本机整理，相关文字按需发送给 DeepSeek。</p></div></div><Card title="连接状态" subtitle="密钥只由本机服务读取，不进入浏览器、任务包或源码。"><p><span className="pill">{status?.configured?'已配置':'尚未配置'}</span> {status?.model||'模型待配置'}</p><Button disabled={!status?.configured||busy} onClick={async()=>{setBusy(true);try{const r=await fetch('/api/ai/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),data=await r.json();if(!r.ok)throw new Error(data.error);setResult('连接成功，可以开始分析。')}catch(e){setResult(e instanceof Error?e.message:'连接失败')}finally{setBusy(false)}}}>{busy?'正在测试…':'测试连接'}</Button>{result&&<p role="status">{result}</p>}</Card><Card title="本机配置方法" subtitle="在工具项目根目录配置 .env.local，保存后重启本机服务。"><ol className="instructions"><li>将项目中的 .env.example 复制为 .env.local。</li><li>保留 DeepSeek 服务地址；填写账户支持的模型名称和 API 密钥。</li><li>重启工具，回到这里测试连接。</li></ol><p className="muted">无需将密钥发到聊天中。工具也不会自动读取 LifeOS 的密钥。未配置时仍可使用来源提取与人工审核。</p></Card></>
}
