// A starting point for the weekly file. The importer matches header names
// loosely (see FIELD_ALIASES), so an existing office spreadsheet usually works
// as-is -- this is here so there is something known-good to copy.
const TEMPLATE = [
  "Action,Name,House Number,Street,Publication,Floor/Side,Instructions",
  "add,Goldstein,123,Forest Ave,The Voice,,Leave at side door",
  "remove,Klein,45,Shenandoah Dr,The Voice,,",
  "change,Weiss,7,Dune Ct,,Basement,Do not leave on the porch",
].join("\r\n");

export function GET() {
  return new Response(TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="weekly-import-template.csv"',
    },
  });
}
