/**
 * @eco/ui — componentes do Ecossistema UI (design-system/ no projeto).
 * Estilos: importe "@eco/ui/ui.css" uma vez no globals.css do app, depois de "@eco/tokens/tokens.css".
 */
export { cx } from "./cx";
export { Glyph, type GlyphName } from "./glyph";
export { Button, buttonClass, RowActions, type ButtonProps, type ButtonVariant, type ButtonSize } from "./actions";
export { ConfirmAction } from "./confirm";
export { StatusBadge, Tag, Receipt, Tick, Callout, Meter, type StatusBadgeProps, type MessageStatus } from "./status";
export { Form, FormSection, FormActions, Field, TextInput, Select, Textarea, type FieldProps } from "./form";
export { Page, PageHeader, BackLabel, Card, EmptyState } from "./layout";
export { DataTable, Cell2, type Column } from "./table";
export { Thread, DaySeparator, MessageBubble, ThreadEvent, WindowStatus, Composer, type MessageBubbleProps, type ComposerProps } from "./inbox";
export { TemplatePreview, type TemplatePreviewProps, type TemplateHeader, type TemplateButton } from "./template-preview";
export { STATUS, getStatus, resolveStatus, statusOptions, type Intent, type StatusDef, type StatusDomain, type StatusIcon } from "@eco/tokens/status-map";
