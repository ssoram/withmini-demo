import type { ReactNode } from 'react'

interface ScreenProps {
  title?: string
  subtitle?: string
  children?: ReactNode
  footer?: ReactNode
}

/**
 * 모든 촬영 플로우 화면이 공유하는 레이아웃 틀.
 * 스펙 섹션 4.0: 버튼 위치·진행 표시·전체 레이아웃 구조를 화면마다 동일하게 유지한다.
 */
export default function Screen({ title, subtitle, children, footer }: ScreenProps) {
  return (
    <div className="screen">
      {(title || subtitle) && (
        <header className="screen-header">
          {title && <h1>{title}</h1>}
          {subtitle && <p className="screen-subtitle">{subtitle}</p>}
        </header>
      )}
      <div className="screen-body">{children}</div>
      {footer && <footer className="screen-footer">{footer}</footer>}
    </div>
  )
}
