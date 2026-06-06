(function () {
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s，。；、：:！？!?（）()《》“”"'·\-]/g, "");
  }

  function gradeSelection(question, selected) {
    const value = Array.isArray(selected) ? selected.slice().sort().join("") : String(selected || "");
    const answer = String(question.answer || "").split("").sort().join("");
    return value === answer ? "correct" : "wrong";
  }

  function gradeRisk(question, response) {
    const normalized = normalizeText(response);
    const keywords = question.keywords || [];
    const matched = keywords.filter((keyword) => normalized.includes(normalizeText(keyword)));
    const missing = keywords.filter((keyword) => !matched.includes(keyword));
    const ratio = keywords.length ? matched.length / keywords.length : 0;
    const result = ratio >= 0.8 ? "correct" : ratio >= 0.5 ? "basic" : "wrong";
    return { result, ratio, matched, missing };
  }

  function scoreDelta(round, result, points) {
    if (round === "required") return result === "correct" ? 10 : 0;
    if (round === "quick" || round === "overtime") return result === "correct" ? 10 : -10;
    if (round === "risk") return result === "correct" ? Number(points || 0) : -Number(points || 0);
    return 0;
  }

  function shuffle(items, random) {
    const result = items.slice();
    const rng = random || Math.random;
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function pickUnique(items, count, random) {
    return shuffle(items, random).slice(0, Math.min(Number(count), items.length));
  }

  window.QuizCore = { normalizeText, gradeSelection, gradeRisk, scoreDelta, shuffle, pickUnique };
})();
