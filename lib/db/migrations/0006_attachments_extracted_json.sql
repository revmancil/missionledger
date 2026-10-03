-- 0006_attachments_extracted_json
-- Store the invoice-reader output alongside the uploaded document so the
-- extracted vendor / dates / amounts survive a page reload and can be shown
-- again without re-running OCR.
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS extracted_json TEXT;
