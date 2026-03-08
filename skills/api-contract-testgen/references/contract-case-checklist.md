# Contract Case Checklist

## Route Inventory

1. Method and path are explicit.
2. Auth requirement is explicit.
3. Required body, query, and header fields are explicit.

## Positive Cases

1. Success status code matches implementation.
2. Response body includes the contract-critical fields only.
3. State-dependent behavior is asserted when relevant.

## Negative Cases

1. Missing auth or token failure.
2. Missing required field or invalid payload shape.
3. Conflict or rejection semantics for duplicate or mismatched requests.

## Evidence

1. Each added case cites the implementation rule it covers.
2. Targeted test commands pass before broader smoke is invoked.
3. Residual uncovered contract edges are called out explicitly.
