type StepItem = {
  title: string
  description: string
  state: 'idle' | 'active' | 'done'
}

export function StepProgress({ steps }: { steps: readonly StepItem[] }) {
  return (
    <div className="step-progress">
      {steps.map((step, index) => (
        <div key={step.title} className={`step-row ${step.state}`}>
          <div className="step-rail" aria-hidden="true">
            <span className={`step-dot ${step.state}`} />
            {index < steps.length - 1 ? <span className={`step-line ${step.state === 'done' ? 'done' : ''}`} /> : null}
          </div>
          <div className="step-copy">
            <strong>{step.title}</strong>
            <p>{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
