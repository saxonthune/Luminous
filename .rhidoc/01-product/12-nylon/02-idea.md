---
title: Idea
summary: A canvas app for differentiating software behavior into a bipartite network of Transformations and Contracts
tags: [nylon, apps, behavior, transformations, contracts, differentiation]
deps: [doc01.04, doc01.12.03, doc01.12.04]
---

# Idea

Nylon is a Luminous app for designing how data changes as software runs. A
Document alternates Contracts and Transformations. A Contract states the data
available at one point. A Transformation states in prose how software changes
that data and lists the data it needs. This alternating structure makes the path
from an external source to a visible result readable by a person and available
as structured context to an agent.

Nylon complements the other Luminous apps. Atlas describes the parts of a
program and their relationships. Linen describes one control-flow Trace. Rayon
shows an observed execution. Nylon describes the intended transformations and
the data contracts between them, whether or not one run exercises every path.

## Bipartite structure

Every Arc joins one Contract and one Transformation. An Arc never joins two
Contracts or two Transformations. A path therefore alternates:

`Contract → Transformation → Contract`

The Document does not treat Contracts as executable tokens. A Contract is
freeform multiline text. The text can hold JSON, YAML, a language type, or prose
while the design is taking shape.

A Transformation may declare a Contract Pair. The pair holds one Input Contract
and one Output Contract and states that the Transformation changes the input
type into the output type. The two Contracts remain separate Nodes in the
alternating network, but the canvas presents them as two halves of one compound
object. This makes “request transformed into response” visible without
collapsing the Contracts into the Transformation or inventing a second kind of
Arc.

A choice remains part of the alternating network. One decision Contract can
feed multiple Transformations whose prose states mutually exclusive guards. For
example, the rate-limit decision feeds an admitted path and a rejected path;
the rejected path creates a failure Contract that is serialized into the shared
HTTP response. The diagram does not imply that both outcomes occur together.

## Differentiation

A Transformation can differentiate into a nested network. The Transformation
becomes the container for the detail that explains it. Its incoming and outgoing
Contracts remain the boundary of that detail.

The smallest differentiation replaces `P → T → P` with
`P → Tₐ₁ → Pₐ → Tₐ₂ → P`. The two child Transformations and the
Contract between them belong to the differentiated Transformation. The expanded
network remains bipartite, and the parent Transformation remains available as
the collapsed account of the same behavior.

Arc Insertion places its new Nodes with the deeper endpoint's Parent
Transformation. This makes insertion deterministic when an Arc crosses a
containment boundary. Reparenting then moves either new Node to the surrounding
Transformation when the design assigns ownership differently.

## Worked documents

The .NET REST API document starts with a JSON HTTP request and ends with a JSON
HTTP response. The API contains `CustomerController.cs`, `CustomerService.cs`,
and `CustomerRepository.cs` as differentiated Parent Transformations. A
customer database sits outside the API as a separate Transformation. The
controller turns the HTTP request into a business `CustomerLookup` and turns the
business result into the HTTP response. The service turns `CustomerLookup` into
`Customer result`. The repository uses Entity Framework to turn `Customer
query` into `customer database result`; along that path, Entity Framework
prepares a SQL query, the database turns it into a SQL result, and the
repository materializes the result.

To introduce the repository, Arc Insertion replaces the Arc from `Service
guard` to `Customer query contract`. Because `Service guard` is deeper, the new
Contract and Transformation initially belong to `CustomerService.cs`.
Reparenting moves both Nodes to `Customers API`. Differentiating the new
Transformation then adds the Entity Framework detail inside
`CustomerRepository.cs`.

The specimen presents those boundaries as four Contract Pairs:

- `HTTP request → HTTP response` for the API;
- `CustomerLookup → Customer result` for the service; and
- `Customer query → customer database result` for the repository; and
- `SQL query → SQL result` for the database.

The controller's rate-limit policy also shows the rejected path through a 429
failure Contract to the API's Output Contract.

The specimen also shows startup configuration as a second path through the
API. `Application starting` is an external lifecycle Contract. Application
startup contains the orchestration and binding steps, while the environment,
AWS Secrets Manager, and AppOptions providers remain outside the API. Each
provider owns a request/result Contract Pair. The returned settings cross into
startup, where `Bind and validate IOptions` produces typed `options` Contracts
for database, rate-limit, and controller behavior. Those `IOptions` Contracts
enter the runtime Transformations as additional inputs, so application classes
receive typed configuration without reading deployment resources directly.

The customer database is itself differentiated. It contains the `Customers`
and `AppOptions` table Contracts. The customer lookup path transforms a SQL
query through the `Customers` table into a SQL result, while the AppOptions
provider reads the `AppOptions` table for the startup path.

The nyc-subwhere document works backward from the train pose required by the
renderer: longitude and latitude, bearing, color, and uncertainty. It follows
the transformations through track interpolation, the stateful TripEstimator,
the render snapshot, worker-side feed reshaping, protobuf decoding, and the MTA
realtime feed.

## Agent access

Nylon exposes its actions through a command-line interface that calls the
Luminous server. A shared Nylon action executor prepares the projection and
geometry, calls cactus for layout, and applies domain operations. The server
serializes actions for each Document, checks revisions, and saves results with
bounded in-memory undo and redo history. The static demo uses the same executor
and history with in-memory storage. Camera, selection, and container disclosure
remain local to each view.

The file remains ordinary JSON and can also be edited directly. An observed
external edit clears history and establishes a new revision. Nylon actions use
the action API; whole-document imports are replacement actions. This is Nylon's
explicit exception to the platform's storage-only server direction.
