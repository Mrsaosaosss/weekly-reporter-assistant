import {it,expect} from 'vitest'
import {render,screen} from '@testing-library/react'
import {App} from './App'
it('首屏有清楚的任务入口',()=>{render(<App/>);expect(screen.getByRole('heading',{name:'周报汇总'})).toBeVisible()})
