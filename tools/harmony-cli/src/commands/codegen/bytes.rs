use anyhow::{Result, bail};
use harmony_protocol::{HarmonyEntry, Signature};
use specta::ResolvedTypes;
use specta::datatype::{DataType, Fields, Reference};

/// Cross-check every `bytes_in` / `bytes_out` declaration against the
/// resolved type graph.
///
/// The macro cannot see through `Rpc<MediaContent>` to that struct's fields,
/// so the byte-carrying field is declared at the export site. Codegen does
/// hold the graph, so it verifies the declaration rather than trusting it —
/// catching drift in both directions: a payload that grows a `Bytes` field
/// without a declaration would silently fall back to a JSON number array,
/// and a stale declaration would name a field that no longer exists.
///
/// Matching is by count, not name: specta reports serde-renamed field names
/// (`raw_data` -> `rawData`) while the declaration names the Rust field, so
/// comparing names directly would produce false failures.
pub(super) fn verify(
    sigs: &[(&'static HarmonyEntry, Signature)],
    bytes: &DataType,
    resolved: &ResolvedTypes,
) -> Result<()> {
    for (entry, sig) in sigs {
        check(
            entry.wire,
            "bytes_in",
            entry.bytes_in,
            sig.input.as_ref(),
            bytes,
            resolved,
        )?;
        check(
            entry.wire,
            "bytes_out",
            entry.bytes_out,
            sig.output.as_ref(),
            bytes,
            resolved,
        )?;
    }
    Ok(())
}

fn check(
    wire: &str,
    attr: &str,
    declared: Option<&str>,
    payload: Option<&DataType>,
    bytes: &DataType,
    resolved: &ResolvedTypes,
) -> Result<()> {
    let found = payload.map_or(0, |dt| count_byte_fields(dt, bytes, resolved));

    match (found, declared) {
        (0, None) | (1, Some(_)) => Ok(()),
        (0, Some(field)) => {
            bail!("`{wire}` declares {attr} = \"{field}\" but its payload carries no `Bytes` field")
        }
        (_, None) => bail!(
            "`{wire}` carries a `Bytes` field but does not declare {attr}; on desktop it would \
             degrade to a JSON number array"
        ),
        (n, Some(_)) => {
            bail!("`{wire}` carries {n} `Bytes` fields; only one per payload is supported")
        }
    }
}

/// Named fields of the payload struct whose type is `Bytes`. Only the top
/// level is inspected — that is the only shape the emitted wrappers can
/// take a field out of.
fn count_byte_fields(payload: &DataType, bytes: &DataType, resolved: &ResolvedTypes) -> usize {
    let DataType::Reference(Reference::Named(named)) = payload else {
        return 0;
    };
    let Some(ndt) = named.get(resolved.as_types()) else {
        return 0;
    };
    let DataType::Struct(strct) = ndt.ty() else {
        return 0;
    };
    let Fields::Named(fields) = strct.fields() else {
        return 0;
    };
    fields
        .fields()
        .iter()
        .filter(|(_, field)| field.ty() == Some(bytes))
        .count()
}
