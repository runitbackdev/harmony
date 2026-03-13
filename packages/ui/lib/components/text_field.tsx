import type { InputHTMLAttributes } from "react";
import { cn } from "../utils";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

function TextField({ label, error, className, ...props }: TextFieldProps) {
  return (
    <label data-scope="text-field" data-part="root" className="label">
      <span
        data-scope="text-field"
        data-part="label"
        className="label-text text-sm"
      >
        {label}
      </span>
      <input
        data-scope="text-field"
        data-part="input"
        data-invalid={error ? "" : undefined}
        className={cn("input", className)}
        {...props}
      />
      {error && (
        <p
          data-scope="text-field"
          data-part="error"
          className="text-error-500 text-xs"
        >
          {error}
        </p>
      )}
    </label>
  );
}

export { TextField };
