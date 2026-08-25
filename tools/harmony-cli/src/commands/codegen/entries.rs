use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Result, anyhow};
use harmony_protocol::{EntryKind, HarmonyEntry, Signature};
use specta::ResolvedTypes;
use specta::datatype::DataType;
use specta_typescript::{Typescript, collect_references, primitives};

/// Flattened view of one entry, with every wire type already rendered to
/// its TypeScript reference. A slot with no type renders as `void`.
pub(super) struct EntryRow {
    pub(super) wire: &'static str,
    pub(super) js: &'static str,
    pub(super) module: &'static str,
    pub(super) kind: EntryKind,
    pub(super) input_ts: String,
    pub(super) output_ts: String,
    pub(super) initial_ts: String,
    pub(super) chunk_ts: String,
    pub(super) snapshot_for: Option<&'static str>,
    pub(super) bytes_in: Option<&'static str>,
    pub(super) bytes_out: Option<&'static str>,
}

/// Render every entry's signature, returning the rows plus the set of
/// named types they reference — the import list, collected structurally by
/// specta rather than scraped back out of the rendered strings.
pub(super) fn collect_entries(
    sigs: Vec<(&'static HarmonyEntry, Signature)>,
    ts: &Typescript,
    resolved: &ResolvedTypes,
) -> Result<(Vec<EntryRow>, BTreeSet<String>)> {
    let (rows, references) = collect_references(|| {
        sigs.into_iter()
            .map(|(entry, sig)| {
                Ok(EntryRow {
                    wire: entry.wire,
                    js: entry.js,
                    module: entry.module,
                    kind: entry.kind,
                    input_ts: render(ts, resolved, sig.input.as_ref())?,
                    output_ts: render(ts, resolved, sig.output.as_ref())?,
                    initial_ts: render(ts, resolved, sig.initial.as_ref())?,
                    chunk_ts: render(ts, resolved, sig.chunk.as_ref())?,
                    snapshot_for: entry.snapshot_for,
                    bytes_in: entry.bytes_in,
                    bytes_out: entry.bytes_out,
                })
            })
            .collect::<Result<Vec<_>>>()
    });

    let names = references
        .into_iter()
        .filter_map(|r| r.get(resolved.as_types()).map(|ndt| ndt.name().to_string()))
        .collect();

    Ok((rows?, names))
}

fn render(ts: &Typescript, resolved: &ResolvedTypes, dt: Option<&DataType>) -> Result<String> {
    let Some(dt) = dt else {
        return Ok("void".to_owned());
    };
    match dt {
        DataType::Reference(r) => primitives::reference(ts, resolved, r),
        other => primitives::inline(ts, resolved, other),
    }
    .map_err(|e| anyhow!("typescript render failed: {e}"))
}

/// Invert the `snapshot_for` annotations into `subscription wire -> snapshot
/// RPC wire`. The attribute is declared on the RPC export and names the
/// subscription whose late-joiner snapshot that RPC serves — so the lookup
/// runs the other way around from how renderers want it.
pub(super) fn snapshot_map(entries: &[EntryRow]) -> BTreeMap<&'static str, &'static str> {
    entries
        .iter()
        .filter(|e| matches!(e.kind, EntryKind::Rpc))
        .filter_map(|e| e.snapshot_for.map(|sub| (sub, e.wire)))
        .collect()
}

/// Bucket entries by kind, each bucket sorted by wire name so emission is
/// deterministic.
pub(super) fn group_by_kind(entries: &[EntryRow]) -> BTreeMap<EntryKind, Vec<&EntryRow>> {
    let mut by_kind: BTreeMap<EntryKind, Vec<&EntryRow>> = BTreeMap::new();
    by_kind.insert(EntryKind::Rpc, Vec::new());
    by_kind.insert(EntryKind::Command, Vec::new());
    by_kind.insert(EntryKind::Subscription, Vec::new());
    for entry in entries {
        by_kind
            .get_mut(&entry.kind)
            .expect("preinserted")
            .push(entry);
    }
    for list in by_kind.values_mut() {
        list.sort_by(|a, b| a.wire.cmp(b.wire));
    }
    by_kind
}
