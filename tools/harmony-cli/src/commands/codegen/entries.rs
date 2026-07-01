use std::collections::BTreeMap;

use harmony_protocol::{EntryKind, HarmonyEntry, HarmonyTypes};

/// Flattened view of one `HarmonyEntry`. Renderers consume `EntryRow`s
/// instead of the raw `inventory` entry so the type-kind union is
/// pre-projected to plain `Option<&'static str>` fields.
pub(super) struct EntryRow {
    pub(super) wire: &'static str,
    pub(super) js: &'static str,
    pub(super) module: &'static str,
    pub(super) kind: EntryKind,
    pub(super) input_ts: &'static str,
    pub(super) output_ts: Option<&'static str>,
    pub(super) initial_ts: Option<&'static str>,
    pub(super) chunk_ts: Option<&'static str>,
    pub(super) snapshot_for: Option<&'static str>,
}

pub(super) fn collect_entries() -> Vec<EntryRow> {
    inventory::iter::<HarmonyEntry>()
        .map(|entry| {
            let (input_ts, output_ts, initial_ts, chunk_ts) = match entry.types {
                HarmonyTypes::Rpc {
                    input_ts,
                    output_ts,
                    ..
                } => (input_ts, Some(output_ts), None, None),
                HarmonyTypes::Command { input_ts, .. } => (input_ts, None, None, None),
                HarmonyTypes::Subscription {
                    input_ts,
                    initial_ts,
                    chunk_ts,
                    ..
                } => (input_ts, None, Some(initial_ts), Some(chunk_ts)),
            };
            EntryRow {
                wire: entry.wire,
                js: entry.js,
                module: entry.module,
                kind: entry.kind,
                input_ts,
                output_ts,
                initial_ts,
                chunk_ts,
                snapshot_for: entry.snapshot_for,
            }
        })
        .collect()
}

/// Invert the `snapshot_for` annotations into `subscription wire -> snapshot
/// RPC wire`. The attribute is declared on the RPC export
/// (`#[harmony_export(..., snapshot_for = "<subscription>")]`) and names the
/// subscription whose late-joiner snapshot that RPC serves — so the lookup has
/// to run the other way around from how renderers (which key by subscription)
/// want it.
pub(super) fn snapshot_map(entries: &[EntryRow]) -> BTreeMap<&'static str, &'static str> {
    entries
        .iter()
        .filter(|e| matches!(e.kind, EntryKind::Rpc))
        .filter_map(|e| e.snapshot_for.map(|sub| (sub, e.wire)))
        .collect()
}

/// Bucket entries by `EntryKind` (Rpc / Command / Subscription) with each
/// bucket sorted alphabetically by wire name — gives renderers a
/// deterministic emission order.
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
