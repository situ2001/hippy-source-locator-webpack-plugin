# Hippy Source Locator

This package equips eligible Hippy React development compilations with source-location metadata and forwards DevTools node selections to the page runtime.

## Language

**Source-locator activation**:
The transition that equips an eligible compilation with JSX source metadata, the locator runtime, the Hippy UI module alias, and optional debug-server selection forwarding.
_Avoid_: Initialization, setup

**Configuration transaction**:
The complete planned set of Webpack changes required by inspector activation; it either commits as a whole or leaves the compiler unchanged.
_Avoid_: Incremental mutation, partial configuration
