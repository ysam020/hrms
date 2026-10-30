import {
  Button,
  Field,
  FormGrid,
  IconButton,
  Select,
  Switch,
  TextArea,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
} from "@next/ui";
import {
  PROFILE_FIELDS,
  QUESTION_TYPES,
  hasOptions,
  type ApplicationFormConfig,
  type FieldMode,
  type QuestionType,
  type ScreeningQuestion,
} from "./jobConfig";
import s from "./job.module.css";

// Which optional fields the public application form asks for, and the
// opening's own screening questions. Name, email and mobile are always
// asked; Aadhaar is never part of the application form.

const MODE_LABELS: [FieldMode, string][] = [
  ["hidden", "Don't ask"],
  ["optional", "Optional"],
  ["required", "Required"],
];

export function FormFieldsEditor({
  value,
  onChange,
}: {
  value: ApplicationFormConfig;
  onChange: (v: ApplicationFormConfig) => void;
}) {
  const setField = (key: string, mode: FieldMode) =>
    onChange({ ...value, fields: { ...value.fields, [key]: mode } });
  return (
    <FormGrid columns={2}>
      <Field label="Résumé">
        <Select
          value={value.resume}
          onChange={(e) =>
            onChange({
              ...value,
              resume: e.target.value as ApplicationFormConfig["resume"],
            })
          }
        >
          <option value="required">Required</option>
          <option value="optional">Optional</option>
        </Select>
      </Field>
      <Field label="Cover Letter">
        <Select
          value={value.coverLetter}
          onChange={(e) =>
            onChange({ ...value, coverLetter: e.target.value as FieldMode })
          }
        >
          {MODE_LABELS.map(([m, l]) => (
            <option key={m} value={m}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {PROFILE_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <Select
            value={value.fields[f.key]}
            onChange={(e) => setField(f.key, e.target.value as FieldMode)}
          >
            {MODE_LABELS.map(([m, l]) => (
              <option key={m} value={m}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      ))}
    </FormGrid>
  );
}

const blankQuestion = (): ScreeningQuestion => ({
  label: "",
  type: "short_text",
  required: false,
  options: [],
  helpText: "",
});

export function ScreeningQuestionsEditor({
  value,
  onChange,
  error,
}: {
  value: ScreeningQuestion[];
  onChange: (v: ScreeningQuestion[]) => void;
  error?: string;
}) {
  const update = (i: number, patch: Partial<ScreeningQuestion>) =>
    onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...value];
    const [q] = next.splice(i, 1);
    next.splice(i + by, 0, q);
    onChange(next);
  };
  return (
    <div className={s.questions}>
      {value.length === 0 && (
        <p className="px-meta">
          No screening questions. Candidates see only the form fields above.
        </p>
      )}
      {value.map((q, i) => (
        <fieldset key={q.id ?? `new-${i}`} className={s.question}>
          <legend className="px-sr-only">Question {i + 1}</legend>
          <FormGrid columns={2}>
            <Field label={`Question ${i + 1}`} className={fieldSpan2}>
              <TextInput
                value={q.label}
                maxLength={300}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </Field>
            <Field label="Answer Type">
              <Select
                value={q.type}
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  update(i, {
                    type,
                    options: hasOptions(type) ? q.options : [],
                  });
                }}
              >
                {QUESTION_TYPES.map(([t, l]) => (
                  <option key={t} value={t}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Help Text" optional>
              <TextInput
                value={q.helpText}
                maxLength={300}
                onChange={(e) => update(i, { helpText: e.target.value })}
              />
            </Field>
            {hasOptions(q.type) && (
              <Field
                label="Choices"
                hint="One per line, at least two"
                className={fieldSpan2}
              >
                <TextArea
                  rows={Math.max(3, q.options.length + 1)}
                  value={q.options.join("\n")}
                  onChange={(e) =>
                    update(i, { options: e.target.value.split("\n") })
                  }
                />
              </Field>
            )}
          </FormGrid>
          <div className="px-row" style={{ justifyContent: "space-between" }}>
            <label className={inlineCheckClass}>
              <Switch
                checked={q.required}
                onChange={(required) => update(i, { required })}
                label="Required"
              />
              Required
            </label>
            <div className="px-row" style={{ gap: 4 }}>
              <IconButton
                icon="chevronUp"
                label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              />
              <IconButton
                icon="chevronDown"
                label="Move down"
                disabled={i === value.length - 1}
                onClick={() => move(i, 1)}
              />
              <IconButton
                icon="trash"
                label="Remove question"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              />
            </div>
          </div>
        </fieldset>
      ))}
      {error && (
        <p
          className="px-meta"
          role="alert"
          style={{ color: "var(--px-danger)" }}
        >
          {error}
        </p>
      )}
      <div>
        <Button
          icon="plus"
          disabled={value.length >= 20}
          onClick={() => onChange([...value, blankQuestion()])}
        >
          Add Question
        </Button>
      </div>
    </div>
  );
}
