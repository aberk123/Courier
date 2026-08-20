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
    backgroundColor: "#eee",
    paddingVertical: 2.5,
    paddingHorizontal: 4,
  },
  stopRow: { flexDirection: "row", marginBottom: 1.5, paddingHorizontal: 4 },
  stopAddress: { width: "30%", fontFamily: "Helvetica-Bold" },
  // Amrom noted the name "doesn't really matter to the driver", so it is kept
  // but de-emphasized -- it still disambiguates two units at one address, and
  // it is present in the sheets they use today.
  stopName: { width: "18%", color: "#666" },
  stopPubs: { width: "24%", color: "#333" },
  stopNotes: { width: "28%", color: "#111" },
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
          {booklet.lines.map((line, index) =>
            line.kind === "direction" ? (
              <Text key={index} style={styles.direction}>
                {line.text}
              </Text>
            ) : (
              <View key={index} style={styles.stopRow} wrap={false}>
                <Text style={styles.stopAddress}>
                  {line.stop.houseNumber} {line.stop.street}
                  {line.stop.floorSide ? ` (${line.stop.floorSide})` : ""}
                </Text>
                <Text style={styles.stopName}>{line.stop.recipientName ?? ""}</Text>
                <Text style={styles.stopPubs}>{line.stop.publications.join(", ")}</Text>
                <Text style={styles.stopNotes}>{line.stop.instructions.join(" · ")}</Text>
              </View>
            ),
          )}
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
