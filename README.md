# DeltaSculptor

DeltaSculptor is a TypeScript library for generating and applying [JSON Patch](https://www.rfc-editor.org/rfc/rfc6902) operations. It provides functionalities to create patches between objects, apply patches in both destructive and immutable ways, generate inverse patches for rollback, and more.

## Table of Contents

- Installation
- Usage
  - Creating a Patch
  - Applying a Patch
  - Generating an Inverse Patch
- API Reference
- Contributing
- License

## Installation

Ensure you have [pnpm](https://pnpm.io/) installed, then install the dependencies:

```sh
pnpm install
```

## Usage

### Creating a Patch

Use the DeltaSculptor.createPatch method to generate a JSON Patch between two objects.

```ts
import { DeltaSculptor } from "delta-sculptor";

const original = { foo: "bar", items: [1, 2, 3] };
const updated = { foo: "baz", items: [1, 3, 4] };

const patch = DeltaSculptor.createPatch(original, updated);
console.log(patch);
```

### Applying a Patch

Apply the generated patch to an object destructively using DeltaSculptor.applyPatch:

```ts
DeltaSculptor.applyPatch(original, patch);
console.log(original); // { foo: "baz", items: [1, 3, 4] }
```

Or apply it immutably using DeltaSculptor.applyPatchImmutable:

```ts
const newObj = DeltaSculptor.applyPatchImmutable(original, patch);
console.log(newObj); // { foo: "baz", items: [1, 3, 4] }
```

### Generating an Inverse Patch

Create an inverse patch to rollback changes using DeltaSculptor.generateInversePatch:

```ts
const inversePatch = DeltaSculptor.generateInversePatch(original, patch);
DeltaSculptor.applyInversePatch(original, inversePatch);
console.log(original); // Reverted to original state
```

## API Reference

### DeltaSculptor

A class providing static methods to work with JSON Patches.

- `createPatch(oldObj, newObj, options?`: Generates a JSON Patch representing the differences between oldObj and newObj.
- `applyPatch(target, patch)`: Applies a patch destructively to the target object.
- `applyPatchImmutable(target, patch)`: Applies a patch immutably, returning a new object.
- `applyPatchWithInverse(target, patch)`: Applies a patch and returns the inverse patch.
- `applyInversePatch(target, inversePatch)`: Applies an inverse patch to rollback changes.
- `generateInversePatch(prePatchObj, patch)`: Generates an inverse patch based on the pre-patch object.
- `applyPatchWithRollback(target, patch)`: Applies a patch with rollback capability in case of failure.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or features.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
