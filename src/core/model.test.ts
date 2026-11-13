import {describe,it,expect} from 'vitest'
import {validateReportMeta} from './model'
const valid={totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'}
describe('报告周期校验',()=>{
 it('接收明确确认的期号和周期',()=>expect(validateReportMeta(valid)).toEqual([]))
 it('拒绝倒置周期',()=>expect(validateReportMeta({...valid,periodEnd:'2026-09-20'}).length).toBeGreaterThan(0))
 it('拒绝不存在的日期',()=>expect(validateReportMeta({...valid,issueDate:'2026-02-30'}).length).toBeGreaterThan(0))
 it('拒绝非整数期号',()=>expect(validateReportMeta({...valid,totalIssue:0.5}).length).toBeGreaterThan(0))
})
