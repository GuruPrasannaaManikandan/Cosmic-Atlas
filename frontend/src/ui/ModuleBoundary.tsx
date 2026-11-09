import { Component, ReactNode } from 'react'

interface Props {
  name: string
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ModuleBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error(`[ModuleBoundary:${this.props.name}] Error:`, error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="module-fallback glass" role="alert">
          <div className="module-fallback-header">
            <span className="module-fallback-icon">⚠</span>
            <b>{this.props.name} failed to load</b>
          </div>
          <p className="small muted">
            {this.state.error?.message || 'A network error occurred while loading this module.'}
          </p>
          <button
            className="btn ghost small"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            ↻ Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function ModuleLoader({ label }: { label?: string }) {
  return (
    <div className="module-loader" aria-label="Loading module">
      <div className="module-loader-spinner" />
      {label && <span className="small muted">{label}</span>}
    </div>
  )
}
