import { useEffect, useRef } from "react";
import { X, Play, LoaderCircle } from "lucide-react";
export function Brand() {
  return (
    <a className="brand" href={import.meta.env.BASE_URL}>
      <Play size={26} fill="currentColor" strokeWidth={1.5} />
      <span>CasioVideo</span>
    </a>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
export function Progress({ state, onCancel }) {
  return (
    <Modal title={state.title || "Preparando tu vídeo"}>
      <div className="progress-display">
        <LoaderCircle size={26} className="spin" />
        <strong>
          {Math.round(state.percent || 0)}
          <small>%</small>
        </strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Progreso"
        aria-valuenow={Math.round(state.percent || 0)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${state.percent || 0}%` }} />
      </div>
      <p className="muted" aria-live="polite">
        {state.label}
      </p>
      {onCancel && (
        <button className="btn secondary" onClick={onCancel}>
          Cancelar conversión
        </button>
      )}
    </Modal>
  );
}
export function Slider({
  label,
  values,
  value,
  onChange,
  format = (v) => String(v),
  hint,
}) {
  const auto = value === "auto",
    index = auto
      ? Math.floor(values.length / 2)
      : Math.max(
          0,
          values.findIndex((v) => String(v) === String(value)),
        );
  return (
    <div className="slider-field">
      <div className="field-heading">
        <label>{label}</label>
        <button
          type="button"
          className={`auto ${auto ? "active" : ""}`}
          aria-pressed={auto}
          aria-label={`Auto: ${label}`}
          onClick={() => onChange(auto ? values[index] : "auto")}
        >
          Auto
        </button>
      </div>
      <div className="slider-value">
        {auto ? "Automático" : format(values[index])}
      </div>
      <input
        aria-label={label}
        type="range"
        min="0"
        max={values.length - 1}
        step="1"
        value={index}
        className={auto ? "auto-range" : ""}
        style={{"--range-fill": `${index / Math.max(1,values.length - 1) * 100}%`}}
        aria-valuetext={auto ? "Automático" : format(values[index])}
        onChange={(e) => onChange(values[Number(e.target.value)])}
      />
      <div className="range-labels">
        <span>{format(values[0])}</span>
        <span>{format(values.at(-1))}</span>
      </div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
