---
title: Initial Transcript
summary: Initial conversation establishing Twill's codebase-query model, data model, and progressive module-and-contract map.
tags: [twill, transcript, code-query, modules, contracts, source-analysis]
deps: [doc01.04]
---

# Initial Transcript

This extract preserves the relevant user prompts verbatim. The closing notes condense the assistant's responses into the resulting design direction.

## Starting question: source as queryable data

> https://dashbit.co/blog/evolving-ai-era read this and consider our $braincrawl L3 research on software design and my draft /home/saxon/Documents/clown-train/predrafting/software-assemblage/260825_software-assemblage.md . If source code is data, then it can be stored as a database, but which one depend on usage patterns. When an engineer is looking at a codebase to understand what will actually happen in a production system when that code is deployed. Say we had a capable code database that could accept queries. What would those queries be? help me brainstorm what a developer does. For example, they want to trace execution from an entry point to the module theyre considering to change. Or they want to find all usages of a function; or they need to see models used in a guard clause. what else?

The discussion identifies questions about execution paths, references, state and data flow, change impact, production behavior, and external effects as reasons to make code information queryable.

## Database shape and agent access

> 1) so a relational db is better than a document db in this case? how do we permit maximum flexibility for different codebases which may have different concerns? is EAV enough? 2) is there something in https://github.com/tidewave-ai or maybe https://github.com/tidewave-ai/tidewave_app that reveals what this company is doing to make code information available to agents?

> for the tidewave question, what I'm considering is a poc that handles a pipeline like: source code -> data model -> query language output -> new luminous app that renders these queries on demand. help me think out the data model and query langauge part

The design direction is a graph-shaped semantic model with typed entities and relationships, flexible annotations, and evidence provenance. The storage engine remains open; a relational implementation can serve as a POC if it supports the required path queries. Tidewave's published tools provide a precedent for on-demand runtime access, while the proposed source database serves reusable static queries.

## Golden query: modules and contracts

> noted. suppose the query output can be converted to a json, which a new app (Twill) will know how to represent. another golden query that I want to think through: I want a list of 'modules' filtered by a given condition (eg top level only, or only in a given folder etc); I want to have a manifest of connections between them (function call, usage of model, maybe api routes are annotated in source code), and finally I want to see all contracts that are used between these modules (interfaces, api request/responses (annotated if necessary)). then, Twill would be able to show the modules and have some sort of progressive disclosure that lets the user click to see contracts, or show them as smaller nodes clumping around the bigger module nodes, and so on. what would it take to produce this flow?

The proposed query selects modules, aggregates their connections from symbol-level facts, and retrieves contracts associated with those connections. Its JSON projection carries stable identities, relation kinds, source evidence, and contract references. Twill renders the overview first and requests contributing paths or contract details when the user expands a module or connection.
