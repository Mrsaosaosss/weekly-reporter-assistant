import type {AIReview} from './analysis/reviewContract'
export type FieldKey = 'unit'|'supplier'|'project'|'description'|'owner'|'deadline'|'history'|'current'|'next'|'deviation'|'result'|'status'|'content'|'work'|'meetingDate'|'remarks'
export type ReviewDecision = 'pending'|'accept'|'edit'|'keep'|'verify'
export type ReportStatus = 'draft'|'analyzing'|'review'|'ready'|'archived'
export type SheetCategory = 'source'|'batch'|'farm'|'special'|'todo'
export const categories:Record<SheetCategory,string>={source:'源头质量问题',batch:'批量质量问题',farm:'自有风场重点问题',special:'专项工作',todo:'周例会待办事项'}
export const fieldLabels:Record<FieldKey,string>={unit:'企业名称',supplier:'部件厂',project:'项目名称',description:'问题描述',owner:'责任人',deadline:'计划完成时间',history:'完成进度',current:'本周具体工作进展',next:'下周工作计划',deviation:'偏差说明及纠偏措施',result:'阶段性结论/成果',status:'完成情况',content:'工作内容',work:'重点工作',meetingDate:'周例会时间',remarks:'备注'}
export interface CellRef {fileId:string;sheet:string;address:string}
export interface RowContext {height?:string;row:number;start:number;index:number;size:number;sharedFields:FieldKey[]}
export interface SourceFragment {reportingUnit?:string;targetUnits?:string[];category?:SheetCategory;fieldRefs?:Partial<Record<FieldKey,CellRef>>;rowContext?:RowContext;id:string;refs:CellRef[];unit:string;project:string;taskPath:string[];fields:Partial<Record<FieldKey,string>>;rawText:string}
export interface ReportItem {rowContext?:RowContext;id:string;reportId:string;category:SheetCategory;unit:string;project:string;taskPath:string[];fields:Partial<Record<FieldKey,string>>;targets:Partial<Record<FieldKey,CellRef>>}
export interface Proposal {id:string;reportId:string;itemId:string;field:FieldKey;before:string;suggested:string;sourceIds:string[];warnings:string[];batchId:string;baseRevision:number;aiReview?:AIReview}
export interface ReviewRecord {sourceIds?:string[];proposalId:string;decision:ReviewDecision;finalText?:string;note:string;revision:number;updatedAt:string}
export interface ReportMeta {totalIssue:number;weeklyIssue:number;periodStart:string;periodEnd:string;issueDate:string}
export interface ValidationIssue {code:string;message:string;severity:'warning'|'error';itemId?:string;sourceId?:string}
export interface Cell {address:string;row:number;column:number;text:string;type:string;formula?:string;style?:string;rich:boolean}
export interface Worksheet {name:string;path:string;cells:Record<string,Cell>;merges:string[];xml:string}
export interface WorkbookDocument {fileId:string;digest:string;bytes:Uint8Array;parts:Record<string,Uint8Array>;sheets:Worksheet[]}
export interface SheetMapping {sheet:string;category:SheetCategory;headerRow:number;columns:Partial<Record<FieldKey,number>>;metadataTargets:string[];sequenceColumn?:number}
export interface ParsedReport {reportingUnit?:string;items:ReportItem[];fragments:SourceFragment[];warnings:ValidationIssue[];mappings:SheetMapping[]}
export interface MatchResult {itemId:string;sourceIds:string[];ambiguous:boolean;reason:string}
export interface CoverageResult {unmatchedItems:string[];unmappedSources:string[];excluded:Record<string,string>}
export type FileRole='baseline'|'source'|'validation'
export interface FileAsset {targetUnits?:string[];todoSource?:boolean;id:string;reportId:string;name:string;role:FileRole;unit:string;digest:string;bytes:Uint8Array;supersedes?:string}
export interface ImportInput {targetUnits?:string[];todoSource?:boolean;name:string;bytes:Uint8Array;role:FileRole;unit:string;supersedes?:string}
export interface ManualCellDecision {text:string;sourceId?:string;mode:"source"|"edit";itemId:string;field:FieldKey}
export interface ManualReviewState {additions?:{sourceId:string;parentId?:string}[];migrationNotes?:string[];decisions:Record<string,Partial<Record<FieldKey,ManualCellDecision>>>;sources:Record<string,string>;completed:string[]}
export interface ReportTask {reviewMode?:"manual";manualReview?:ManualReviewState;id:string;meta:ReportMeta;status:ReportStatus;expectedUnits:string[];sourceFileIds:string[];revision:number;createdAt:string;updatedAt:string;warnings:ValidationIssue[];exclusions:Record<string,string>;dispositions?:Record<string,{kind:'exclude'|'appendix';reason:string}>;metadataConfirmed:boolean;activeReviewId?:string;aiReviewCompletedRevision?:number;structureVersion?:number}
export interface ReviewCommand {reportId:string;proposalId:string;decision:ReviewDecision;finalText?:string;note:string;expectedRevision:number}
export interface AnalysisBatch {kind?:'review';id:string;reportId:string;inputDigest:string;rulesVersion:string;model:string;status:'running'|'complete'|'failed'|'cancelled';error?:string;createdAt:string}
export interface CellPatch {ref:CellRef;text:string;before:string;textStyle:'base'|'confirmed-plain';valueType?:'number';highlight?:'changed'|'attention'}
export interface InsertRequest {sheet:string;row:number;templateRow:number;items:ReportItem[]}
export interface ExportPlan {patches:CellPatch[];insertions:InsertRequest[];warnings:string[];blockers:string[]}
export interface CandidateSnapshot {aiReviewedCount?:number;id:string;reportId:string;items:ReportItem[];inputDigests:string[];batchIds:string[];frozenAt:string}
export interface Difference {id:string;reportId:string;itemId:string;type:'facts'|'missing'|'extra'|'status'|'date'|'wording'|'unverified';before:string;after:string;sourceIds:string[];confirmed?:string}
export interface RestorePreview {version:number;taskCount:number;fileCount:number;errors:string[];conflicts:string[]}
export const uid=()=>crypto.randomUUID()
export const now=()=>new Date().toISOString()
export function validateReportMeta(meta: ReportMeta): ValidationIssue[] {
 const errors:ValidationIssue[]=[]
 const add=(message:string)=>errors.push({code:'meta',message,severity:'error'})
 if(!Number.isInteger(meta.totalIssue)||meta.totalIssue<1||!Number.isInteger(meta.weeklyIssue)||meta.weeklyIssue<1)add('期号须为正整数')
 for(const date of [meta.periodStart,meta.periodEnd,meta.issueDate]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)add('请填写有效日期')
 }
 if(meta.periodEnd<meta.periodStart)add('报告结束日期不能早于开始日期')
 return errors
}
