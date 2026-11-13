import {type CellRef,type FieldKey,type ReportItem,type WorkbookDocument} from '../../core/model'
import {type SummaryGroup} from '../../core/summary/summary'
import {cellAppearance} from '../../core/workbook/appearance'
import {rowNumber} from '../../core/workbook/read'

function OriginalCell({row,field,book}:{row:ReportItem;field:FieldKey;book:WorkbookDocument}){
 const ref=row.targets[field]
 if(!ref)return <td className="summary-excel-empty">Excel 未提供这一列</td>
 const cell=book.sheets.find(sheet=>sheet.name===ref.sheet)?.cells[ref.address]
 const text=cell?.text??row.fields[field]??''
 const appearance=cellAppearance(book,ref)
 const runs=appearance.runs
 return <td className="summary-excel-cell" style={{color:appearance.color||'#172b20',backgroundColor:appearance.background||'#fff',fontWeight:appearance.bold?'bold':undefined}}>
  <div className="summary-excel-position">{ref.sheet}!{ref.address}
   {row.rowContext&&rowNumber(ref.address)!==row.rowContext.row&&<span> · 合并单元格</span>}
  </div>
  <div className="preserve">{text
   ?runs?.map(run=>run.text).join('')===text
    ?runs.map((run,index)=><span key={index} style={{color:run.color,fontWeight:run.bold?'bold':undefined}}>{run.text}</span>)
    :text
   :<span className="summary-excel-empty">（原单元格为空）</span>}
  </div>
 </td>
}

export function ExcelFieldReference({groups,field,book,fileName}:{groups:SummaryGroup[];field:'current'|'next';book:WorkbookDocument;fileName:string}){
 const label=field==='current'?'本周进展':'下周计划'
 const excelLabel=field==='current'?'本周具体工作进展':'下周工作计划'
 return <section className="summary-excel-reference" aria-label={'Excel '+label+'原文'}>
  <h4>Excel 原文 · {label}</h4>
  <p className="muted small">{fileName}</p>
  {!groups.length&&<p className="muted">已确认本期未报送，没有对应的 Excel 原文。</p>}
  {groups.map(group=><div className="summary-excel-group" key={group.key}>
   <p><strong>{group.unit}{group.role&&'（'+group.role+'）'}</strong> · {group.project}</p>
   <div className="summary-excel-scroll"><table aria-label={group.unit+' '+group.project+' Excel '+label+'原文'}>
    <thead><tr><th scope="col">重点工作 / 工作内容</th><th scope="col">{excelLabel}</th></tr></thead>
    <tbody>{group.rows.map(row=><tr key={row.id}>
     <th scope="row"><small>第 {row.rowContext?.row||'?'} 行</small>
      <div className="preserve">{row.fields.work||'（重点工作未填写）'}</div>
      {row.fields.content&&<div className="preserve summary-excel-content">{row.fields.content}</div>}
      <div className="summary-excel-position">{[row.targets.work,row.targets.content].filter((ref):ref is CellRef=>!!ref).map(ref=>ref.sheet+'!'+ref.address).join(' · ')}</div>
     </th>
     <OriginalCell row={row} field={field} book={book}/>
    </tr>)}</tbody>
   </table></div>
  </div>)}
 </section>
}
