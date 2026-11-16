import { Children, isValidElement, type ReactNode } from 'react'
import { SonaSelect, type SonaSelectOption } from './SonaSelect'
import { PositionIcon } from './PositionIcon'

export function HistorySelect({ children, value, onChangeValue, className = '', disabled, positions, 'aria-label': ariaLabel }: {
  children: ReactNode; value: string | number; onChangeValue: (value: string) => void
  className?: string; disabled?: boolean; positions?: boolean; 'aria-label': string
}) {
  const text = (node: ReactNode): string => Children.toArray(node).map((child)=>isValidElement<{children?:ReactNode}>(child)?text(child.props.children):String(child)).join('')
  const options: SonaSelectOption[] = Children.toArray(children).filter(isValidElement<{value?:string|number;children?:ReactNode;disabled?:boolean}>).map((child)=>({
    value:String(child.props.value??''),label:text(child.props.children),disabled:child.props.disabled,
    ...(positions?{content:<PositionIcon position={String(child.props.value??'')} />}:{}),
  }))
  return <SonaSelect options={options} value={String(value)} onChange={onChangeValue} ariaLabel={ariaLabel} className={`rh-select ${className}`} disabled={disabled} iconOnly={positions} />
}
