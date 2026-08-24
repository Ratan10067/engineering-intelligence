# Engineering Intelligence Platform

## 1. Project Overview

The goal of this project is to build an **AI-powered Engineering
Intelligence platform** that converts historical GitHub engineering
activity into a searchable **Engineering Memory**.

A software repository contains much more information than source code.
Important engineering knowledge is distributed across:

-   Pull Requests (PRs)
-   PR descriptions
-   Commits
-   Changed files
-   Code diffs
-   Code reviews
-   Review comments
-   General discussion comments
-   Linked issues
-   Releases / milestones

The system will collect this information, understand it, organize it
into structured engineering knowledge, make that knowledge searchable,
and allow engineers to ask natural-language questions about how and why
the product evolved.

Examples:

-   What changed between release 5.2 and 5.3?
-   Have we seen this issue before?
-   Which PRs affected memory or performance?
-   Why was this architecture changed?
-   Which components were affected by this change?
-   Which historical PRs are related to the current issue?

The most important requirement is that answers must be backed by
evidence from the original PRs, reviews, commits, and code changes.

------------------------------------------------------------------------

# 2. What We Are Building

At a high level:

``` text
Private GitHub Repository
          |
          v
   GitHub Data Collector
          |
          v
      PostgreSQL
          |
          v
    PR Understanding
         (LLM)
          |
          v
 Structured Engineering
       Knowledge
          |
          v
    Embedding Generation
          |
          v
 PostgreSQL + pgvector
          |
          v
    Hybrid Retrieval
     /           \
Vector Search   Keyword /
                Metadata
     \           /
      \         /
          v
       RAG Engine
          |
          v
          LLM
          |
          v
 Evidence-backed Answer
```

The implementation should be done **step by step**.

Do not try to build the complete AI system at once.

------------------------------------------------------------------------

# 3. Final MVP

The first version should intentionally remain small.

We will use:

``` text
One private GitHub repository
        |
        v
100–500 historical PRs
        |
        v
PostgreSQL
        |
        v
LLM-based PR understanding
        |
        v
Embeddings
        |
        v
pgvector
        |
        v
Hybrid Search
        |
        v
RAG
        |
        v
Evidence-backed Q&A
```

The MVP should demonstrate four scenarios:

1.  Release comparison
2.  Historical issue search
3.  Impact search
4.  Engineering decision understanding

------------------------------------------------------------------------

# 4. Technology Stack

Initial technology choices:

  Component              Technology
  ---------------------- ---------------------------
  Backend                Python + FastAPI
  GitHub Source          GitHub REST/GraphQL API
  Database               PostgreSQL
  Vector Search          pgvector
  LLM                    Claude API initially
  Embeddings             Dedicated embedding model
  Frontend               React / Next.js
  Local Infrastructure   Docker Compose

The LLM and embedding provider should be kept replaceable.

------------------------------------------------------------------------

# 5. Project Structure

A recommended structure is:

``` text
engineering-intelligence/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── collectors/
│   │   ├── db/
│   │   ├── models/
│   │   ├── services/
│   │   ├── llm/
│   │   ├── embeddings/
│   │   ├── retrieval/
│   │   ├── rag/
│   │   └── evaluation/
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── services/
│   └── package.json
│
├── migrations/
│
├── scripts/
│
├── evaluation/
│   └── dataset/
│
├── docker-compose.yml
├── .env.example
└── README.md
```

The exact folder structure can be adjusted while implementing.

------------------------------------------------------------------------

# 6. STEP 1 --- Understand the GitHub Data

Before writing the AI portion, understand the source data.

The first task is to understand what information GitHub gives us for a
Pull Request.

For each PR we eventually want:

``` text
PR
├── number
├── title
├── description
├── author
├── reviewers
├── labels
├── created_at
├── merged_at
├── commits
├── commit messages
├── changed files
├── code diffs
├── reviews
├── review comments
├── discussion comments
├── linked issues
└── release / milestone
```

### Important

At this stage:

**Do not use an LLM.**

We are only collecting factual information.

The collector should be deterministic.

------------------------------------------------------------------------

# 7. STEP 2 --- Create the GitHub Collector

Build a Python service that communicates with GitHub.

Responsibilities:

1.  Authenticate with GitHub.
2.  Find the selected repository.
3.  Fetch historical merged PRs.
4.  Handle pagination.
5.  Fetch commits for each PR.
6.  Fetch changed files.
7.  Fetch diffs where available.
8.  Fetch reviews.
9.  Fetch review comments.
10. Fetch discussion comments.
11. Fetch linked issues where available.
12. Fetch release/milestone information.
13. Handle GitHub API rate limits.
14. Retry temporary failures.

Start with a small target such as:

``` text
10 PRs
```

Do not begin with 500 PRs.

First prove that one PR can be collected correctly.

Then move to:

``` text
10 → 50 → 100 → 500
```

------------------------------------------------------------------------

# 8. STEP 3 --- Store Raw GitHub Data

Once the collector works, store the information in PostgreSQL.

At this stage, do not try to make the database "AI-ready".

The goal is simply:

> PostgreSQL should become the reliable source of truth for the GitHub
> history.

A basic relationship should look like:

``` text
Repository
    |
    └── Pull Request
            |
            ├── Commits
            ├── Changed Files
            ├── Reviews
            ├── Comments
            └── Release / Milestone
```

Store both:

-   raw GitHub information
-   normalized information needed by the application

------------------------------------------------------------------------

# 9. STEP 4 --- Make Ingestion Idempotent

This is an important engineering requirement.

Suppose you run:

``` bash
python collect.py
```

today.

Then run it again tomorrow.

You should NOT get:

``` text
PR #100
PR #100
PR #100
PR #100
```

Instead, the second run should recognize that the PR already exists.

Use stable GitHub identifiers and database constraints.

The ingestion pipeline should support:

``` text
New PR
    |
    v
Insert

Existing PR
    |
    v
Update if necessary
```

Also track synchronization state.

For example:

``` text
repository
last_synced_at
```

Later, this will allow incremental synchronization.

------------------------------------------------------------------------

# 10. STEP 5 --- Test the Data Layer

Before touching the LLM, verify the database.

You should be able to answer questions directly from PostgreSQL such as:

``` text
How many PRs were collected?

How many commits belong to PR #123?

Which files did PR #123 change?

How many reviews did PR #123 receive?

Which PRs belong to release 5.3?
```

If these questions cannot be answered reliably, do not move forward.

The AI layer depends completely on the quality of this data.

------------------------------------------------------------------------

# 11. STEP 6 --- Build PR Understanding

Now we introduce the LLM.

The purpose is:

> Convert raw engineering activity into structured engineering
> knowledge.

For every PR, provide the LLM with relevant information:

``` text
PR description
+
commit messages
+
important changed files / diffs
+
reviews
+
discussion comments
```

The LLM should produce structured information.

Example:

``` json
{
  "summary": "Optimized image cache eviction strategy",
  "motivation": "Reduce memory consumption on low-memory devices",
  "components": [
    "ImageCache",
    "Gallery"
  ],
  "change_types": [
    "memory",
    "performance"
  ],
  "impact": [
    "image loading",
    "memory usage"
  ],
  "architectural_change": true
}
```

------------------------------------------------------------------------

# 12. STEP 7 --- Distinguish Facts From Inference

This is one of the most important parts of the project.

The system must distinguish between three kinds of information.

## Documented

The original engineering discussion explicitly states it.

Example:

``` text
PR says:

"We changed the cache eviction strategy
to reduce memory usage."
```

This is:

``` text
DOCUMENTED
```

## Inferred

The LLM believes something based on evidence, but the source does not
explicitly say it.

Example:

``` text
The change probably improved performance.
```

This is:

``` text
INFERRED
```

## Unknown

There is not enough evidence.

Example:

``` text
The available engineering history does not
contain enough information to determine why
this architectural decision was made.
```

This is:

``` text
UNKNOWN
```

Never allow the LLM to present an inference as an established fact.

------------------------------------------------------------------------

# 13. STEP 8 --- Store Structured Engineering Knowledge

Create a separate representation for the knowledge produced from each
PR.

A PR should eventually have information such as:

``` text
PR #834

Summary:
...

Motivation:
...

Components:
...

Change types:
...

Impact:
...

Architectural change:
...

Files:
...

Release:
...

Important review discussions:
...

Evidence:
...
```

Keep the relationship between the generated knowledge and the original
GitHub objects.

For example:

``` text
Engineering Summary
        |
        +---- PR #834
        |
        +---- Review #...
        |
        +---- Commit #...
        |
        +---- File ImageCache.cpp
```

This relationship is essential for evidence-backed answers.

------------------------------------------------------------------------

# 14. STEP 9 --- Create Searchable Engineering Documents

Do not immediately embed every raw GitHub object.

Instead, create meaningful engineering documents.

Possible document types:

``` text
PR Summary
PR Description
Important Review Discussion
File-level Change Summary
Architecture Decision
Issue/Fix Description
```

For example:

``` text
Document Type:
PR_SUMMARY

PR:
834

Content:
"PR #834 changed the ImageCache eviction strategy
to reduce memory consumption on low-memory devices..."
```

Each document should have metadata.

Example:

``` text
repository
pr_number
author
date
release
components
change_type
files
labels
document_type
```

------------------------------------------------------------------------

# 15. STEP 10 --- Generate Embeddings

Now introduce the embedding model.

An embedding converts text into a vector representation.

Conceptually:

``` text
"memory issue in image cache"
             |
             v
        Embedding Model
             |
             v
     [0.21, -0.13, 0.87, ...]
```

Store these vectors using PostgreSQL + pgvector.

At this point:

``` text
Engineering Document
        |
        v
Embedding
        |
        v
pgvector
```

------------------------------------------------------------------------

# 16. STEP 11 --- Implement Semantic Search

Now implement your first search mechanism.

User:

``` text
Have we seen image caching memory problems before?
```

Convert the question into an embedding.

Then search pgvector for similar engineering documents.

Example:

``` text
Query
  |
  v
Embedding
  |
  v
Vector Search
  |
  +---- PR #834
  +---- PR #621
  +---- PR #512
```

Initially, get this working independently.

Do not build the complete RAG system yet.

------------------------------------------------------------------------

# 17. STEP 12 --- Implement Keyword Search

Vector search is not enough.

Suppose the user asks:

``` text
Which PR changed ImageCache.cpp?
```

Exact identifiers such as:

``` text
ImageCache.cpp
PR #834
release 5.3
```

are better handled using keyword/metadata search.

Implement PostgreSQL keyword/full-text search.

You should now have:

``` text
Semantic Search
+
Keyword Search
```

------------------------------------------------------------------------

# 18. STEP 13 --- Implement Metadata Filtering

Add structured filters.

Examples:

``` text
release = 5.3

component = ImageCache

change_type = memory

file = ImageCache.cpp

author = ...
```

Now the system can combine:

``` text
Semantic similarity
+
Exact keywords
+
Metadata
```

------------------------------------------------------------------------

# 19. STEP 14 --- Build Hybrid Retrieval

This is the heart of the retrieval system.

For every question:

``` text
User Question
      |
      +-------------------+
      |                   |
      v                   v
Semantic Search      Keyword Search
      |                   |
      +---------+---------+
                |
                v
       Metadata Filtering
                |
                v
             Ranking
                |
                v
        Best Evidence
```

Do not depend only on vector similarity.

The purpose of hybrid retrieval is to combine:

-   semantic understanding
-   exact identifiers
-   metadata
-   ranking

------------------------------------------------------------------------

# 20. STEP 15 --- Add Ranking / Reranking

Suppose hybrid retrieval produces:

``` text
50 candidate documents
```

You don't want to send all 50 to the LLM.

Reduce them:

``` text
50 candidates
      |
      v
    Rank
      |
      v
Top 10
      |
      v
Rerank
      |
      v
Top 5
```

The final context should contain the strongest evidence.

Also remove duplicate evidence.

------------------------------------------------------------------------

# 21. STEP 16 --- Build the RAG Pipeline

Now we can finally build the complete question-answering system.

Flow:

``` text
User Question
      |
      v
Hybrid Retrieval
      |
      v
Relevant PRs
Reviews
Commits
Code Changes
      |
      v
Context Builder
      |
      v
LLM
      |
      v
Answer + Evidence
```

The LLM should NOT answer based on its general knowledge of software
development.

It should answer based on retrieved engineering history.

------------------------------------------------------------------------

# 22. STEP 17 --- Implement Evidence-backed Answers

Every important claim should be connected to evidence.

Example:

``` text
Question:

Have we seen image caching memory problems before?
```

Possible answer:

``` text
Yes.

A similar issue was addressed in PR #834, which changed
the image-cache eviction strategy after memory consumption
increased on low-memory devices.

A related bitmap retention problem was addressed in PR #621.

Evidence:
- PR #834
- PR #621
```

The application should provide links back to the original GitHub objects
where possible.

------------------------------------------------------------------------

# 23. STEP 18 --- Implement "Insufficient Evidence"

This is mandatory.

Suppose someone asks:

``` text
Why did the team choose architecture X?
```

but the repository contains no evidence.

The system should NOT invent an answer.

Instead:

``` text
I could not determine the reason from the
available engineering history.

Relevant changes were found, but the indexed
PRs and discussions do not explicitly document
the architectural motivation.
```

This is better than hallucinating.

------------------------------------------------------------------------

# 24. STEP 19 --- Build the Backend API

Expose the system through FastAPI.

Possible endpoints:

``` text
POST /repositories
POST /repositories/{id}/sync

GET /pull-requests/{id}

POST /search

POST /questions

GET /evidence/{id}
```

The exact API can evolve.

The important separation should be:

``` text
API
 |
 +--- Data Collection
 |
 +--- Knowledge Processing
 |
 +--- Search
 |
 +--- RAG
 |
 +--- Evaluation
```

------------------------------------------------------------------------

# 25. STEP 20 --- Build the MVP Frontend

Keep the UI simple.

You need:

``` text
Repository Selector
        |
        v
Question Input
        |
        v
AI Answer
        |
        v
Evidence Panel
        |
        +--- PR links
        +--- Commit links
        +--- Review information
        +--- Changed files
        |
        v
Search Filters
```

Do not spend significant time on animations or complex UI.

The project's primary value is answer quality.

------------------------------------------------------------------------

# 26. STEP 21 --- Build the Evaluation Dataset

Before claiming that the system works, create known questions.

Example:

``` text
Question:
Which PR fixed the ImageCache memory issue?

Expected Evidence:
PR #834
```

Create many such questions.

The expected evidence should already be known.

------------------------------------------------------------------------

# 27. STEP 22 --- Measure Retrieval Accuracy

For every question:

``` text
Question
   |
   v
Retrieval
   |
   v
Top 5
```

Check:

``` text
Was the expected PR in Top 5?
```

This gives you retrieval accuracy.

Example:

``` text
100 questions

Expected PR found in Top 5:
87

Retrieval@5 = 87%
```

------------------------------------------------------------------------

# 28. STEP 23 --- Measure Answer Accuracy

Now evaluate the complete RAG response.

Ask:

``` text
Did the final answer correctly explain
the historical engineering change?
```

This should be measured separately from retrieval.

A system can retrieve the correct PR but still generate an incorrect
answer.

------------------------------------------------------------------------

# 29. STEP 24 --- Measure Citation Accuracy

This is especially important for your project.

Suppose the answer says:

``` text
PR #834 reduced memory usage.
```

Check whether PR #834 actually supports that claim.

You want:

``` text
Claim
  |
  v
Citation
  |
  v
Original Evidence
```

If the citation does not support the claim, that is a failure.

------------------------------------------------------------------------

# 30. STEP 25 --- Measure Hallucination Rate

Check whether the LLM introduced information that wasn't supported by
the retrieved evidence.

For example:

``` text
Evidence:
Memory optimization

LLM:
"This reduced memory usage by 35%."
```

If the repository never says 35%, that is unsupported.

Track these failures.

------------------------------------------------------------------------

# 31. STEP 26 --- Measure Latency

Record:

``` text
Question
   |
   +--- Retrieval time
   |
   +--- Reranking time
   |
   +--- LLM time
   |
   v
Total latency
```

Example:

``` text
Retrieval: 150 ms
Reranking: 300 ms
LLM:       2.1 sec

Total:     2.55 sec
```

The actual numbers will depend on implementation.

------------------------------------------------------------------------

# 32. STEP 27 --- Test the Four Main MVP Scenarios

Your final MVP should demonstrate:

## Scenario 1 --- Release Comparison

``` text
What changed between release 5.2 and 5.3?
```

## Scenario 2 --- Historical Issue Search

``` text
Have we seen this issue before?
```

## Scenario 3 --- Impact Search

``` text
Which PRs affected memory or performance?
```

## Scenario 4 --- Decision Understanding

``` text
Why was this architecture changed?
```

These four scenarios test different parts of your system.

------------------------------------------------------------------------

# 33. STEP 28 --- Add Incremental Synchronization

Once the historical system works, make it useful for a real repository.

Instead of repeatedly downloading everything:

``` text
GitHub
  |
  v
Already indexed PRs
```

only fetch:

``` text
New PRs
Updated PRs
New comments
New reviews
```

Then:

``` text
New GitHub Data
      |
      v
PostgreSQL
      |
      v
Knowledge Processing
      |
      v
Embeddings
      |
      v
Search Index
```

This turns the prototype into a continuously updated engineering memory.

------------------------------------------------------------------------

# 34. STEP 29 --- Dockerize Everything

Use Docker Compose for local development.

Conceptually:

``` text
docker-compose
      |
      +--- PostgreSQL
      |
      +--- Backend
      |
      +--- Frontend
```

This makes the project easier to run and demonstrate.

------------------------------------------------------------------------

# 35. STEP 30 --- Final MVP Demo

At the end, someone should be able to:

``` text
1. Select repository

2. Ask:
   "Have we seen this memory issue before?"

3. System retrieves:
   PR #834
   PR #621
   ...

4. System generates:
   Evidence-backed explanation

5. User clicks:
   PR #834

6. User sees:
   Original GitHub evidence
```

That is your finished MVP.

------------------------------------------------------------------------

# 36. Recommended Implementation Order

If you are actually starting tomorrow, follow this exact order:

``` text
STEP 1
Understand GitHub PR data
        ↓
STEP 2
Create GitHub collector
        ↓
STEP 3
Collect 1 PR
        ↓
STEP 4
Collect 10 PRs
        ↓
STEP 5
Design PostgreSQL schema
        ↓
STEP 6
Store GitHub data
        ↓
STEP 7
Make ingestion idempotent
        ↓
STEP 8
Verify database manually
        ↓
STEP 9
Build PR understanding
        ↓
STEP 10
Generate structured knowledge
        ↓
STEP 11
Store engineering documents
        ↓
STEP 12
Generate embeddings
        ↓
STEP 13
Implement vector search
        ↓
STEP 14
Implement keyword search
        ↓
STEP 15
Implement metadata filtering
        ↓
STEP 16
Build hybrid retrieval
        ↓
STEP 17
Add ranking/reranking
        ↓
STEP 18
Build RAG
        ↓
STEP 19
Add evidence/citations
        ↓
STEP 20
Add insufficient-evidence handling
        ↓
STEP 21
Build FastAPI
        ↓
STEP 22
Build simple frontend
        ↓
STEP 23
Create evaluation dataset
        ↓
STEP 24
Measure retrieval accuracy
        ↓
STEP 25
Measure answer accuracy
        ↓
STEP 26
Measure citation accuracy
        ↓
STEP 27
Measure hallucination rate
        ↓
STEP 28
Measure latency
        ↓
STEP 29
Add incremental sync
        ↓
STEP 30
Dockerize + final demo
```

------------------------------------------------------------------------

# 37. What NOT to Do

Avoid these mistakes.

### Don't start with the frontend

``` text
Bad:
UI → chatbot → backend → data
```

Instead:

``` text
Data → Knowledge → Retrieval → RAG → API → UI
```

### Don't embed everything blindly

Do not immediately create embeddings for every:

``` text
comment
commit
diff
line
```

Create meaningful engineering documents first.

### Don't use an LLM for deterministic tasks

GitHub data collection should not involve an LLM.

Use the LLM for understanding and structuring engineering knowledge.

### Don't trust vector search alone

Use:

``` text
Vector
+
Keyword
+
Metadata
+
Ranking
```

### Don't let the LLM invent engineering history

If evidence doesn't exist:

``` text
UNKNOWN
```

not:

``` text
Probably...
```

presented as fact.

### Don't skip evaluation

A working demo is not enough.

You need measurable retrieval and answer quality.

------------------------------------------------------------------------

# 38. Definition of Done

The MVP is complete when all of these are true:

-   [ ] Historical GitHub PRs can be reliably collected.
-   [ ] Commits, files, reviews, comments and release information can be
    stored.
-   [ ] Data ingestion is idempotent.
-   [ ] PRs can be converted into structured engineering knowledge.
-   [ ] Documented, inferred and unknown information are distinguished.
-   [ ] Engineering documents can be embedded.
-   [ ] pgvector search works.
-   [ ] Keyword search works.
-   [ ] Metadata filtering works.
-   [ ] Hybrid retrieval works.
-   [ ] Relevant evidence can be ranked.
-   [ ] RAG can generate answers from retrieved evidence.
-   [ ] Answers contain traceable evidence.
-   [ ] Unsupported conclusions are identified.
-   [ ] The four target scenarios work.
-   [ ] Retrieval accuracy is measured.
-   [ ] Answer accuracy is measured.
-   [ ] Citation accuracy is measured.
-   [ ] Hallucination rate is measured.
-   [ ] Latency is measured.
-   [ ] A simple frontend can demonstrate the system.

------------------------------------------------------------------------

# 39. Post-MVP

Only after the MVP works should you consider:

``` text
Component evolution timelines
        ↓
Similar PR detection
        ↓
Similar bug detection
        ↓
Architecture decision history
        ↓
Module ownership
        ↓
Change-risk analysis
        ↓
Regression investigation
        ↓
Cross-repository search
        ↓
Jira integration
        ↓
Engineering documentation
        ↓
CI/CD intelligence
```

The long-term goal is to move from:

> "Search our old PRs"

to:

> **"Understand how our engineering system evolved, why decisions were
> made, and what impact a new change may have."**

------------------------------------------------------------------------

# 40. The Most Important Principle

Do not think of this project as:

``` text
GitHub + LLM + Vector DB
```

Think of it as:

``` text
GitHub Engineering History
             ↓
     Structured Knowledge
             ↓
      Searchable Memory
             ↓
      Evidence Retrieval
             ↓
      Engineering Answer
```

The AI is only one component.

The real product is the **Engineering Memory**.
