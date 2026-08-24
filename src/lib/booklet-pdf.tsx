import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { STANDING_FOOTER, type Booklet, type CoverRow } from "./booklet";

// The cover page reserves room for the standing footer; the route pages carry
// only a page number, so they get most of that space back as printable rows.
const pageBase = { paddingTop: 34, paddingHorizontal: 34, fontSize: 9.5 };

const styles = StyleSheet.create({
  page: { ...pageBase, paddingBottom: 46 },
  routePage: { ...pageBase, paddingBottom: 26 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9.5, color: "#555", marginTop: 3 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 13,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  row: { flexDirection: "row", marginBottom: 2.5 },
  rowAddress: { width: "55%", paddingRight: 8 },
  rowDetail: { width: "45%", color: "#333" },
  empty: { color: "#777", fontStyle: "italic" },
  direction: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    marginTop: 9,
    marginBottom: 3,
    // Darker than it was, because the zebra stripes below are #ededed and a
    // driving instruction must stay the loudest thing on the page -- against
    // stripes, the old #eee no longer read as different.
    backgroundColor: "#d8d8d8",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
  },
  // Ari, 2026-08-20: the rows were too tight to follow down the page, and he
  // accepted extra pages to fix it. The spacing is the point here -- do not
  // shrink it back to save paper without asking him.
  //
  // It is paddingVertical rather than marginBottom so the zebra band below can
  // fill the whole row. A margin would leave white gutters between bands, which
  // reads as separate blocks rather than a continuous striped list.
  // A stretch with no deliveries for this booklet. Every word is kept -- it
  // carries the turns between the stops that ARE here -- but it reads quieter
  // than a live instruction so the eye skips to the next delivery.
  skipped: {
    fontSize: 8,
    color: "#666",
    fontStyle: "italic",
    backgroundColor: "#fafafa",
    borderLeftWidth: 2,
    borderLeftColor: "#c8c8c8",
    marginTop: 6,
    marginBottom: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  stopRow: { flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 4 },
  // Light enough to survive a photocopy and not drink toner, and lighter than
  // the direction rows' #eee so those still read as the louder element.
  stopRowAlt: { backgroundColor: "#ededed" },
  // Wider now that the recipient name column is gone. The floor/side rides in
  // this cell, which is what actually tells two households at one house number
  // apart now that the name does not.
  stopAddress: { width: "42%", fontFamily: "Helvetica-Bold" },
  // Big and bold, because the drivers read these off the sheet at night, often
  // by dome light. The lineHeight was previously squeezed to 0.76 to keep row
  // height identical to before; that made the letters of consecutive rows almost
  // touch. Now that Ari has accepted extra pages for legibility, it sits at its
  // natural height instead.
  stopPubs: {
    width: "20%",
    fontSize: 13.5,
    lineHeight: 1,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    letterSpacing: 1,
  },
  stopNotes: { width: "38%", color: "#111" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 34,
    right: 34,
    borderTopWidth: 1,
    borderTopColor: "#bbb",
    paddingTop: 5,
    fontSize: 7.5,
    color: "#333",
  },
  pageNumber: { position: "absolute", bottom: 8, right: 34, fontSize: 7.5, color: "#777" },
});

function Section({ title, rows }: { title: string; rows: CoverRow[] }) {
  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>
        {title} ({rows.length})
      </Text>
      {rows.length ? (
        rows.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.rowAddress}>{row.address}</Text>
            <Text style={styles.rowDetail}>{row.detail}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>None this week.</Text>
      )}
    </View>
  );
}

// Deliberately NOT `fixed`: react-pdf repeats a fixed element on every page of
// its flow, which put the driver instructions on all ~15 pages of a long route.
// Unfixed, `position: absolute` pins it to the bottom of the cover page alone.
function Footer() {
  return (
    <View style={styles.footer}>
      {STANDING_FOOTER.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </View>
  );
}

export function BookletDocument({ booklet, printedOn }: { booklet: Booklet; printedOn: string }) {
  const zoneLabel = booklet.zoneName ?? `Zone ${booklet.zoneNumber}`;

  return (
    <Document title={`${zoneLabel} — ${booklet.publicationLabel}`}>
      {/* Cover sheet. Four sections, per Amrom: additions, deletions, changes,
          complaints -- complaints must read as distinct from the rest. */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>
          {booklet.publicationLabel} — {zoneLabel}
        </Text>
        <Text style={styles.subtitle}>
          {printedOn} · {booklet.counts.stops} stops ·{" "}
          {booklet.counts.byPublication.map((p) => `${p.name} ${p.count}`).join("  ")}
        </Text>

        <Section title="Additions" rows={booklet.additions} />
        <Section title="Deletions" rows={booklet.deletions} />
        <Section title="Changes" rows={booklet.changes} />
        <Section title="Complaints" rows={booklet.complaints} />

        <Footer />
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>

      {/* The route itself, in driving order, directions in position. */}
      <Page size="LETTER" style={styles.routePage}>
        <Text style={styles.title}>{zoneLabel} — route</Text>
        <Text style={styles.subtitle}>In delivery order.</Text>

        <View style={{ marginTop: 8 }}>
          {(() => {
            let stopNumber = 0;
            return booklet.lines.map((line, index) => {
              if (line.kind === "direction") {
                return line.skipped ? (
                  <Text key={index} style={styles.skipped}>
                    Nothing for this booklet along here — {line.text}
                  </Text>
                ) : (
                  <Text key={index} style={styles.direction}>
                    {line.text}
                  </Text>
                );
              }
              // Counted across direction rows rather than reset by them, so the
              // stripes stay regular down the whole page.
              const shaded = stopNumber++ % 2 === 1;
              return (
                <View
                  key={index}
                  style={shaded ? [styles.stopRow, styles.stopRowAlt] : styles.stopRow}
                  wrap={false}
                >
                <Text style={styles.stopAddress}>
                  {line.stop.houseNumber} {line.stop.street}
                  {line.stop.floorSide ? ` (${line.stop.floorSide})` : ""}
                </Text>
                <Text style={styles.stopPubs}>
                  {line.stop.publicationLetters.join(" ")}
                </Text>
                  <Text style={styles.stopNotes}>
                    {line.stop.instructions.join(" · ")}
                  </Text>
                </View>
              );
            });
          })()}
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
