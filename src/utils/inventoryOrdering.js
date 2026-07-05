const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const SIOMAI_PRIORITY = new Map([
  ["regular pork siomai", 0],
  ["premium pork siomai", 1],
  ["pork siomai (premium)", 1],
  ["chicken siomai", 2],
  ["japanese siomai", 3],
  ["special japanese siomai", 4]
]);

export const getInventoryPriority = (item) => {
  const normalizedName = normalizeText(item?.name);
  if (!normalizedName) return 1000;

  if (SIOMAI_PRIORITY.has(normalizedName)) {
    return SIOMAI_PRIORITY.get(normalizedName);
  }

  if (normalizedName.includes("siomai")) {
    return 100;
  }

  return 1000;
};

export const compareInventoryDisplayOrder = (left, right) => {
  const leftPriority = getInventoryPriority(left);
  const rightPriority = getInventoryPriority(right);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return normalizeText(left?.name).localeCompare(normalizeText(right?.name), undefined, {
    sensitivity: "base"
  });
};
