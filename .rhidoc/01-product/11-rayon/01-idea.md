---
title: Rayon
summary: A visual debugger that shows a live network of instructions and data transforming external impulses into program behavior.
tags: [rayon, debugger, execution, runtime, visualization]
deps: [doc01.04, doc01.09.01, doc02.17]
---

# Idea

Rayon is a Luminous app for seeing a program execute. It connects source code,
rendered output, and a visual network of the execution that produced that output.
It is the debugging counterpart to a fiddle: a fiddle places source beside its
output; Rayon adds the causal path between them.

## Two-button example

The first specimen is framework-free browser JavaScript with two buttons. The
primary button increments `state.primaryPresses`. When that property reaches
five, the handler creates, configures, and appends the secondary DOM button.
The secondary button increments `state.secondaryCount`.

A primary-button click enters the network as a transient impulse. It moves
through browser event dispatch, the listener call, property read,
transformation, write, DOM text update, and branch test. The carrier changes
along that path: event, control, value, mutation, then structure. The network
stays in place while the carrier and its payload move. On the fifth traversal,
the branch creates a new runtime individual: the secondary button. The user
sees the environment transform rather than receiving a diagram of the event
afterward.

## Runtime projection

Rayon's primary canvas is a morphism-first projection of the currently live
computing environment. Browser mechanisms, instructions, boundaries, runtime
data, and rendered interface individuals are stable centers in a network.
Channels distinguish control sequence from reads, mutations, and structural
effects. An external event is not another permanent node: it is an impulse
that temporarily traverses and activates this structure, changing its carrier
and payload as instructions transform it.

Definitions, activations, closures, event history, and retained objects remain
valid runtime facts, but belong in progressive-disclosure inspectors and
alternate views. They do not accumulate on the primary canvas. Stable runtime
identifiers connect those details back to the live network when the user asks
for them.

## Relation to Luminous

Rayon is a Luminous app, alongside Linen. Linen describes an intended trace.
Rayon presents an observed execution. Both use Modules, control transfer, data
transformation, and progressive disclosure where those terms agree. Rayon may
also retain a time-indexed runtime record for replay and comparison, but that
record supports the live network instead of determining its primary visual
form.
