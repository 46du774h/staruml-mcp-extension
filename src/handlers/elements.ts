import type { Handler } from "../http-server.js";

export const getElementById: Handler = (body) => {
  const id = body._id;

  if (typeof id !== "string" || id.length === 0) {
    return {
      success: false,
      error: "Required field 'id' (string) missing",
    };
  }

  const elem = app.repository.get(id);

  if (!elem) {
    return {
      success: false,
      error: `Element not found: ${id}`,
    };
  }

  return {
    success: true,
    data: shallow(elem as Record<string, unknown>),
  };
};

export const findElements: Handler = (body) => {
  const typeName = typeof body.type === "string" ? body.type : null;
  const nameFilter = typeof body.name === "string" ? body.name : null;

  try {
    // Prefer getInstancesOf when type is given (faster + exact).
    const pool = typeName
      ? (app.repository.getInstancesOf(typeName) as Record<string, unknown>[])
      : app.repository.findAll(() => true);

    const filtered = nameFilter
      ? pool.filter((element) => element.name === nameFilter)
      : pool;

    return {
      success: true,
      data: {
        count: filtered.length,
        elements: filtered.map(shallow),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

export const createElement: Handler = (body) => {
  const typeName = body.type;
  const parentId = body.parentId;
  const name = typeof body.name === "string" ? body.name : undefined;

  if (typeof typeName !== "string" || typeName.length === 0) {
    return {
      success: false,
      error: "Required field 'type' (string) missing, e.g. 'UMLClass'",
    };
  }

  if (typeof parentId !== "string" || parentId.length === 0) {
    return {
      success: false,
      error: "Required field 'parentId' (string) missing",
    };
  }

  const parent = app.repository.get(parentId);

  if (!parent) {
    return {
      success: false,
      error: `Parent element not found: ${parentId}`,
    };
  }

  try {
    const elem = app.factory.createModel({
      id: typeName,
      parent,
      ...(name !== undefined && {
        modelInitializer: (model: Record<string, unknown>) => {
          model.name = name;
        },
      }),
    });

    return {
      success: true,
      data: shallow(elem as Record<string, unknown>),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Create a model element and its visual View on a diagram in one call.
 * Wraps app.factory.createModelAndView.
 */
export const createElementWithView: Handler = (body) => {
  const typeName = body.type;
  const parentId = body.parentId;
  const diagramId = body.diagramId;
  const name = typeof body.name === "string" ? body.name : undefined;

  const x1 = typeof body.x === "number" ? body.x : 100;
  const y1 = typeof body.y === "number" ? body.y : 100;
  const x2 = typeof body.x2 === "number" ? body.x2 : x1 + 100;
  const y2 = typeof body.y2 === "number" ? body.y2 : y1 + 50;

  if (typeof typeName !== "string" || typeName.length === 0) {
    return {
      success: false,
      error: "Required field 'type' missing",
    };
  }

  if (typeof parentId !== "string" || parentId.length === 0) {
    return {
      success: false,
      error: "Required field 'parentId' missing",
    };
  }

  if (typeof diagramId !== "string" || diagramId.length === 0) {
    return {
      success: false,
      error: "Required field 'diagramId' missing",
    };
  }

  const parent = app.repository.get(parentId);
  const diagram = app.repository.get(diagramId);

  if (!parent) {
    return {
      success: false,
      error: `Parent not found: ${parentId}`,
    };
  }

  if (!diagram) {
    return {
      success: false,
      error: `Diagram not found: ${diagramId}`,
    };
  }

  try {
    const factory = app.factory as unknown as {
      createModelAndView: (
        options: Record<string, unknown>,
      ) => Record<string, unknown> | null;
    };

    const options: Record<string, unknown> = {
      id: typeName,
      parent,
      diagram,
      x1,
      y1,
      x2,
      y2,
    };

    if (name !== undefined) {
      options.modelInitializer = (model: Record<string, unknown>) => {
        model.name = name;
      };
    }

    const view = factory.createModelAndView(options);

    if (!view) {
      return {
        success: false,
        error: `StarUML could not create ${typeName}`,
      };
    }

    const model =
      view.model && typeof view.model === "object"
        ? (view.model as Record<string, unknown>)
        : null;

    return {
      success: true,
      data: {
        view: {
          _id: view._id,
        },
        model: model
          ? {
              _id: model._id,
              name: model.name,
            }
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const updateElement: Handler = (body) => {
  const id = body.id;
  const field = body.field;
  const value = body.value;

  if (typeof id !== "string" || id.length === 0) {
    return {
      success: false,
      error: "Required field 'id' missing",
    };
  }

  if (typeof field !== "string" || field.length === 0) {
    return {
      success: false,
      error: "Required field 'field' missing",
    };
  }

  const elem = app.repository.get(id);

  if (!elem) {
    return {
      success: false,
      error: `Element not found: ${id}`,
    };
  }

  try {
    app.engine.setProperty(elem, field, value);

    return {
      success: true,
      data: shallow(elem as Record<string, unknown>),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

export const deleteElement: Handler = (body) => {
  const id = body.id;

  if (typeof id !== "string" || id.length === 0) {
    return {
      success: false,
      error: "Required field 'id' missing",
    };
  }

  const elem = app.repository.get(id);

  if (!elem) {
    return {
      success: false,
      error: `Element not found: ${id}`,
    };
  }

  try {
    const { models, views } = collectDeletionTargets(
      elem as Record<string, unknown>,
    );

    // StarUML Engine.deleteElements(models, views) takes two arrays.
    (
      app.engine as unknown as {
        deleteElements: (models: unknown[], views: unknown[]) => void;
      }
    ).deleteElements(models, views);

    return {
      success: true,
      data: {
        deleted: id,
        models_deleted: models.length,
        views_deleted: views.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Collects the element and nested owned elements, plus Views referring to
 * those elements. The results are split because Engine.deleteElements takes
 * separate model and view arrays.
 */
function collectDeletionTargets(
  root: Record<string, unknown>,
): {
  models: Record<string, unknown>[];
  views: Record<string, unknown>[];
} {
  const seen = new Set<string>();
  const models: Record<string, unknown>[] = [];
  const views: Record<string, unknown>[] = [];
  const stack: Record<string, unknown>[] = [root];

  while (stack.length) {
    const element = stack.pop()!;
    const elementId =
      typeof element._id === "string" ? element._id : "";

    if (!elementId || seen.has(elementId)) continue;
    seen.add(elementId);

    if (isView(element)) {
      views.push(element);
    } else {
      models.push(element);
    }

    const owned = Array.isArray(element.ownedElements)
      ? (element.ownedElements as Record<string, unknown>[])
      : [];
    for (const child of owned) stack.push(child);

    const ownedViews = Array.isArray(element.ownedViews)
      ? (element.ownedViews as Record<string, unknown>[])
      : [];
    for (const view of ownedViews) stack.push(view);

    const subViews = Array.isArray(element.subViews)
      ? (element.subViews as Record<string, unknown>[])
      : [];
    for (const view of subViews) stack.push(view);

    try {
      // Only collect Views that directly depict this element.
      // Do not call getRefsTo: it can traverse references back to the Project
      // root and unintentionally include the entire workspace.
      const repo = app.repository as unknown as {
        getViewsOf?: (
          element: Record<string, unknown>,
        ) => Record<string, unknown>[];
        getEdgeViewsOf?: (
          element: Record<string, unknown>,
        ) => Record<string, unknown>[];
      };

      if (repo.getViewsOf) {
        for (const view of repo.getViewsOf(element) ?? []) {
          stack.push(view);
        }
      }

      if (repo.getEdgeViewsOf) {
        for (const view of repo.getEdgeViewsOf(element) ?? []) {
          stack.push(view);
        }
      }
    } catch {
      // Ignore unsupported repository lookup methods.
    }
  }

  return { models, views };
}

/** Heuristic: a View has a model field pointing back to a model element. */
function isView(element: Record<string, unknown>): boolean {
  if (element.model && typeof element.model === "object") {
    return true;
  }

  const ctor = element.constructor as { name?: string } | undefined;
  const name = ctor?.name ?? "";

  return (
    name.endsWith("View") ||
    name === "Shape" ||
    name === "Edge"
  );
}

/**
 * Connect two existing visual Views with a typed edge.
 * Creates the model relationship and edge View in one call.
 */
export const createEdgeWithView: Handler = (body) => {
  const typeName = body.type;
  const parentId = body.parentId;
  const diagramId = body.diagramId;
  const tailViewId = body.tailViewId;
  const headViewId = body.headViewId;
  const name = typeof body.name === "string" ? body.name : undefined;

  if (typeof typeName !== "string" || typeName.length === 0) {
    return {
      success: false,
      error:
        "Required field 'type' missing (e.g. 'UMLAssociation', 'UMLControlFlow')",
    };
  }

  if (typeof parentId !== "string" || parentId.length === 0) {
    return {
      success: false,
      error: "Required field 'parentId' missing",
    };
  }

  if (typeof diagramId !== "string" || diagramId.length === 0) {
    return {
      success: false,
      error: "Required field 'diagramId' missing",
    };
  }

  if (
    typeof tailViewId !== "string" ||
    tailViewId.length === 0 ||
    typeof headViewId !== "string" ||
    headViewId.length === 0
  ) {
    return {
      success: false,
      error: "Required fields 'tailViewId' and 'headViewId' missing",
    };
  }

  const parent = app.repository.get(parentId);
  const diagram = app.repository.get(diagramId);
  const tailView = app.repository.get(tailViewId);
  const headView = app.repository.get(headViewId);

  if (!parent) {
    return {
      success: false,
      error: `Parent not found: ${parentId}`,
    };
  }

  if (!diagram) {
    return {
      success: false,
      error: `Diagram not found: ${diagramId}`,
    };
  }

  if (!tailView) {
    return {
      success: false,
      error: `Tail view not found: ${tailViewId}`,
    };
  }

  if (!headView) {
    return {
      success: false,
      error: `Head view not found: ${headViewId}`,
    };
  }

  try {
    const factory = app.factory as unknown as {
      createModelAndView: (
        options: Record<string, unknown>,
      ) => Record<string, unknown> | null;
    };

    const options: Record<string, unknown> = {
      id: typeName,
      parent,
      diagram,
      tailView,
      headView,
      tailModel: (tailView as Record<string, unknown>).model,
      headModel: (headView as Record<string, unknown>).model,
    };

    if (name !== undefined) {
      options.modelInitializer = (model: Record<string, unknown>) => {
        model.name = name;
      };
    }

    const view = factory.createModelAndView(options);

    if (!view) {
      return {
        success: false,
        error: `StarUML could not create edge ${typeName}`,
      };
    }

    const model =
      view.model && typeof view.model === "object"
        ? (view.model as Record<string, unknown>)
        : null;

    return {
      success: true,
      data: {
        view: {
          _id: view._id,
        },
        model: model
          ? {
              _id: model._id,
              name: model.name,
            }
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

function shallow(
  elem: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(elem)) {
    if (
      key.startsWith("_") &&
      key !== "_id" &&
      key !== "_parent"
    ) {
      continue;
    }

    if (val === null || val === undefined) {
      out[key] = val;
    } else if (Array.isArray(val)) {
      out[key] = val.map((item) =>
        item &&
        typeof item === "object" &&
        "_id" in item
          ? {
              _id: (item as { _id: string })._id,
              name: (item as { name?: string }).name,
            }
          : item,
      );
    } else if (typeof val === "object" && "_id" in val) {
      out[key] = {
        _id: (val as { _id: string })._id,
        name: (val as { name?: string }).name,
      };
    } else {
      out[key] = val;
    }
  }

  return out;
}