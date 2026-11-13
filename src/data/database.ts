import type {TodoNotice} from '../core/workbook/todoProtection'
import Dexie,{type Table} from 'dexie'
import type {ReportTask,FileAsset,ReportItem,SourceFragment,Proposal,ReviewRecord,AnalysisBatch,CandidateSnapshot,Difference,SheetMapping,MatchResult} from '../core/model'
export interface ExportRevision {todoWarnings?:TodoNotice[];todoOrder?:Uint8Array;id:string;reportId:string;createdAt:string;bytes:Uint8Array;changes:Uint8Array;taskRevision:number;partial:boolean;kind?:'candidate'|'final';exceptions?:Uint8Array;exceptionCount?:number;fileName?:string;aiReviewLog?:Uint8Array;aiReviewedCount?:number}
export class ReportDatabase extends Dexie {
 tasks!:Table<ReportTask,string>;files!:Table<FileAsset,string>;items!:Table<ReportItem,string>;fragments!:Table<SourceFragment&{reportId:string},string>;proposals!:Table<Proposal,string>;reviews!:Table<ReviewRecord,string>;batches!:Table<AnalysisBatch,string>;snapshots!:Table<CandidateSnapshot,string>;differences!:Table<Difference,string>;exports!:Table<ExportRevision,string>;mappings!:Table<{id:string;reportId:string;fileId:string;values:SheetMapping[]},string>;matches!:Table<MatchResult&{id:string;reportId:string},string>
 constructor(name='weekly-report-tool'){super(name);this.version(1).stores({tasks:'id,updatedAt,status',files:'id,reportId,role,digest',items:'id,reportId,category',fragments:'id,reportId',proposals:'id,reportId,itemId,batchId',reviews:'proposalId',batches:'id,reportId',snapshots:'id,reportId',differences:'id,reportId',exports:'id,reportId,createdAt',mappings:'id,reportId,fileId',matches:'id,reportId,itemId'})}
}
export const db=new ReportDatabase()
