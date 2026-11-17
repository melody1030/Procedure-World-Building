# Technique: Agents

[← Back to the main README](../../README.md) 

Once the city is built, it is lived in: **people, pigeons, cats and vehicles**, each driven by a
different agent model from Class 08, and each reacting to the others and to the city around them.
The simulation is pure TypeScript (no three.js); the renderer draws everything with a few
instanced meshes, and a step of the whole simulation takes about 2 ms.

## Who does what

```mermaid
flowchart LR
  subgraph People["People: needs + state machine"]
    needs[Needs grow over time<br/>thirst · rest · company · home] --> decide{Most basic need due?}
    decide -- thirst --> drink[Walk to a vending machine]
    decide -- rest --> bench[Walk to a bench, sit]
    decide -- company --> chat[Gather at the plaza or a fountain]
    decide -- home --> mode{How?}
    mode -- door --> door[Walk into a door]
    mode -- bus --> wait[Wait at a shelter, board the bus]
    mode -- taxi --> hail[Hail a taxi at the curb]
    decide -- none --> stroll[Stroll]
  end
  subgraph Animals
    pigeons[Pigeons: boids<br/>flock, roost, take off]
    cats[Cats: cone of vision<br/>stalk, sprint at pigeons]
  end
  subgraph Traffic
    cars[Cars and vans<br/>random turns]
    taxis[Taxis<br/>dispatched to fares]
    buses[Buses<br/>loop routes, stop at shelters]
  end
  People <-->|yield, wait at the curb,<br/>step aside| Traffic
  People -->|scare| pigeons
  People -->|scare| cats
  cats -->|hunt| pigeons
  Traffic -->|scare| pigeons
```

| Agent | Model | Code |
|---|---|---|
| People | Needs (Maslow order, as in *The Sims*) choosing a goal; a small state machine carrying it out; **flow fields** (one Dijkstra search per goal, shared by everyone) to walk there; separation and keep-right steering so no one walks into a wall, a prop or another person | [`life/agents.ts`](../../site/src/world/life/agents.ts) · [`life/walk.ts`](../../site/src/world/life/walk.ts) |
| Pigeons | Reynolds' **boids** (separation, alignment, cohesion), circling their roost and landing when it is quiet | [`life/agents.ts`](../../site/src/world/life/agents.ts) |
| Cats | Predator with a **cone of vision** and line of sight; stalks slowly, then sprints | [`life/agents.ts`](../../site/src/world/life/agents.ts) |
| Vehicles | **Intelligent Driver Model** for following, junction reservations for turns, shortest paths for taxis and buses | [`life/traffic.ts`](../../site/src/world/life/traffic.ts) |

## State machines

Each agent is a **finite state machine**: a box is a state, an arrow is a transition, and its
label is the condition that fires it. Every transition records why it fired, so clicking an agent
shows its state and the reason it is in it.

### A person

Needs pick the goal; the machine carries it out. "Home" is the one need with a choice of ways:
a door, a bus or a taxi.

```mermaid
stateDiagram-v2
  direction LR
  state "Stroll" as Stroll
  state "Walk to goal" as Walk
  state "Use: bench, vending, chat" as Use
  state "Wait at a shelter or curb" as Wait
  state "Ride a bus or taxi" as Ride
  state "Away indoors" as Away
  [*] --> Stroll
  Stroll --> Walk : a need is due
  Walk --> Use : arrived
  Use --> Stroll : need met
  Walk --> Away : home need, at a door
  Walk --> Wait : home need, by bus or taxi
  Wait --> Ride : it came
  Wait --> Walk : waited too long
  Ride --> Walk : got off
  Away --> Stroll : someone comes out of a door
```

### A cat and a pigeon

Some transitions are fired by **another agent**: a pigeon in the cat's cone of vision starts a
hunt, a person walking by puts the cat to flight from any state, and a person, a vehicle or a
sprinting cat startles a pigeon, whose alarm spreads to its flock.

```mermaid
stateDiagram-v2
  direction LR
  state "Prowl" as Prowl
  state "Hunt" as Hunt {
    direction LR
    state "Stalk" as Stalk
    state "Sprint" as Sprint
    [*] --> Stalk
    Stalk --> Sprint : close enough
  }
  state "Rest" as Rest
  state "Flee" as Flee
  [*] --> Prowl
  Prowl --> Hunt : sees a pigeon (pigeon)
  Prowl --> Rest : sat down
  Hunt --> Rest : it flew off, or lost sight of it
  Rest --> Prowl : rested
  Prowl --> Flee : a person comes by (person)
  Hunt --> Flee : a person comes by (person)
  Rest --> Flee : a person comes by (person)
  Flee --> Rest : safe again
```

```mermaid
stateDiagram-v2
  direction LR
  state "Ground: peck, hop" as Ground
  state "Fly: boids over the roost" as Fly
  state "Land" as Land
  [*] --> Ground
  Ground --> Fly : startled (person, vehicle, cat, or its flock)
  Fly --> Land : quiet again
  Land --> Ground : landed
```

### Planned: a day clock and service crews (Class 09, assignment 2)

Class 09's second assignment asks for agents that "perform tasks and schedules" across the city's
roads and buildings. Two machines would add that; neither is built yet.

**A person's day.** A clock (one day in about ten minutes) adds a layer above the needs: the whole
machine above becomes the **Out** state, and the clock moves people between home, the commute and
work. Homes are megablock and wealthy lots; jobs are core, commercial and industrial lots.

```mermaid
stateDiagram-v2
  direction LR
  state "Asleep at home" as Asleep
  state "Commute: walk, bus, taxi" as Commute
  state "Working" as Working
  state "Out: the needs machine" as Out
  state "Going home" as Home
  [*] --> Asleep
  Asleep --> Commute : 7:00
  Commute --> Working : at the work door
  Working --> Out : 12:00, 18:00
  Out --> Working : after an hour
  Out --> Home : 22:00, or the home need is due
  Home --> Asleep : at the home door
```

**A garbage truck.** A new vehicle that carries the city's waste: it leaves its depot at night,
empties full bins, and unloads at the incinerator in the industrial district.

```mermaid
stateDiagram-v2
  direction LR
  state "Depot" as Depot
  state "Drive to a bin" as Drive
  state "Collect" as Collect
  state "To the incinerator" as Haul
  state "Unload" as Unload
  [*] --> Depot
  Depot --> Drive : 1:00
  Drive --> Collect : at a full bin
  Collect --> Drive : next bin
  Collect --> Haul : truck full
  Haul --> Unload : arrived
  Unload --> Drive : bins left
  Unload --> Depot : all done
```

## How people and vehicles share the streets

- A vehicle brakes for anyone its **body** would pass over in the next few voxels, so it stops
  for someone crossing even on a tight turn.
- Someone about to step off the curb **waits for a gap**, then crosses faster.
- People **walk round** vehicles and **step out of the way** of one beside them; a vehicle kept
  waiting creeps on at walking pace and people make way.
- Going home, a quarter take the **bus** (they wait at a shelter, walk to the lit door and get
  on) and a tenth **hail a taxi** (the nearest free taxi comes to the curb for them). Riders get off
  elsewhere and walk on from there.

## How it looks

| People in a park, pigeons taking off | A bus at its shelter |
|---|---|
| ![Inhabitants](../../site/src/world/screenshots/2026-10-27-inhabitants.webp) | ![Bus stop](../../site/src/world/screenshots/2026-10-28-bus-stop.webp) |

| A taxi at the curb for its fare | Traffic on a stepped street |
|---|---|
| ![Taxi pickup](../../site/src/world/screenshots/2026-10-28-taxi-pickup.webp) | ![Street traffic](../../site/src/world/screenshots/2026-10-28-street-traffic.webp) |

## In the development log

- [Inhabitants (agents, after Class 08)](../../site/src/world/README.md#2026-10-27-inhabitants-agents-after-class-08)
- [Traffic: cars, vans, taxis and buses](../../site/src/world/README.md#2026-10-28-traffic-cars-vans-taxis-and-buses-and-how-people-live-with-them)
- Feedback that asked for it: [Week 6 feedback](../analysis/Week06-feedback.md), which asked to show how inhabitants and vehicles interact with the city
