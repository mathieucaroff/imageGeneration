import { Children, cloneElement, isValidElement, type OptionHTMLAttributes, type SelectHTMLAttributes } from "react"

const fontStyle = { fontFamily: '"DM Mono", monospace' }

export function Select({ children, className = "", style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`font-['DM_Mono'] ${className}`} style={{ ...style, ...fontStyle }} {...props}>
      {Children.map(children, (child) => {
        if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child)) return child
        return cloneElement(child, { style: { ...child.props.style, ...fontStyle } })
      })}
    </select>
  )
}
