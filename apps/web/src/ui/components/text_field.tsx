import type { InputHTMLAttributes } from "react";
import { Input } from "@runitback/react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

function TextField({ label, error, className, ...props }: TextFieldProps) {
  return (
    <label data-scope="text-field" data-part="root" className="flex flex-col gap-1.5">
      <span data-scope="text-field" data-part="label" className="text-small font-medium text-ink">
        {label}
      </span>
      <Input
        data-scope="text-field"
        data-part="input"
        data-invalid={error ? "" : undefined}
        className={className}
        {...props}
      />
      {error && (
        <p data-scope="text-field" data-part="error" className="text-danger text-data">
          {error}
        </p>
      )}
    </label>
  );
}

export { TextField };
