export class AIRequestError extends Error {
 constructor(message:string,public code:string,public retryable=false){super(message);this.name='AIRequestError'}
}
export function transientAIError(error:unknown){
 if(error instanceof AIRequestError)return error.retryable
 if(error&&typeof error==='object'&&'retryable'in error)return (error as {retryable?:unknown}).retryable===true
 return error instanceof Error&&/timeout|timed out|超时|Failed to fetch|fetch failed|network error/i.test(error.message)
}
