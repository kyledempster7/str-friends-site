// Vote code and instant-runoff counting for the Vote page. Pure functions: nothing is sent or stored here.
// The same file is inlined in the page and imported by the tooling tests.
(function (root) {
  'use strict';
  var PREFIX = 'V1';
  var LETTERS = 'ABCDEF';

  function checkDigit(letters) {
    var sum = 0;
    for (var i = 0; i < letters.length; i++) sum += (i + 1) * (LETTERS.indexOf(letters.charAt(i)) + 1);
    return sum % 10;
  }

  function isPermutation(list) {
    if (!list || list.length !== LETTERS.length) return false;
    for (var i = 0; i < LETTERS.length; i++) if (list.indexOf(LETTERS.charAt(i)) < 0) return false;
    return true;
  }

  // ranking: six letters, best first. Returns a code such as V1-CAEBFD-7.
  function encode(ranking) {
    if (!isPermutation(ranking)) throw new Error('A ranking needs each of the six orders once');
    var letters = ranking.join('');
    return PREFIX + '-' + letters + '-' + checkDigit(letters);
  }

  function dashes(text) {
    return String(text).replace(/[‐-―−]/g, '-');
  }

  // Returns { ok: true, ranking } or { ok: false, reason }.
  function parse(token) {
    var m = /^V1-([A-Z]{6})-([0-9])$/.exec(dashes(token).toUpperCase());
    if (!m) return { ok: false, reason: 'It is not shaped like V1-ABCDEF-0.' };
    var ranking = m[1].split('');
    if (!isPermutation(ranking)) return { ok: false, reason: 'It must use each of the six orders once.' };
    if (checkDigit(m[1]) !== Number(m[2])) return { ok: false, reason: 'The last digit does not match. Check for a typo.' };
    return { ok: true, ranking: ranking };
  }

  // Finds every word in a pasted block that starts with V1- and trims chat punctuation around it.
  function tokens(text) {
    return dashes(text).split(/[\s,;]+/)
      .map(function (word) { return word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''); })
      .filter(function (word) { return /^V1-/i.test(word); });
  }

  // ballots: arrays of letters, best first, each a full ranking.
  // tieChoices: letters chosen by the group (coin flip or gut pick) at each tie for fewest votes, in order.
  // Returns { rounds, winner, pending }. pending lists the tied letters when a group choice is still needed.
  function runoff(ballots, tieChoices) {
    var choices = tieChoices || [];
    var total = ballots.length;
    var remaining = LETTERS.split('');
    var rounds = [];
    var tieIndex = 0;
    while (total > 0) {
      var counts = {};
      remaining.forEach(function (c) { counts[c] = 0; });
      ballots.forEach(function (ballot) {
        for (var i = 0; i < ballot.length; i++) if (remaining.indexOf(ballot[i]) >= 0) { counts[ballot[i]]++; break; }
      });
      var round = { counts: counts, remaining: remaining.slice(), winner: null, out: [], tied: null, chosen: null };
      rounds.push(round);
      var leader = remaining.filter(function (c) { return counts[c] * 2 > total; })[0];
      if (leader) { round.winner = leader; return { rounds: rounds, winner: leader, pending: null }; }
      var fewest = Math.min.apply(null, remaining.map(function (c) { return counts[c]; }));
      var lowest = remaining.filter(function (c) { return counts[c] === fewest; });
      if (fewest === 0 || lowest.length === 1) {
        round.out = lowest;
      } else {
        round.tied = lowest;
        var pick = choices[tieIndex];
        if (lowest.indexOf(pick) < 0) return { rounds: rounds, winner: null, pending: lowest };
        round.chosen = pick;
        round.out = [pick];
        tieIndex++;
      }
      remaining = remaining.filter(function (c) { return round.out.indexOf(c) < 0; });
    }
    return { rounds: rounds, winner: null, pending: null };
  }

  root.StrVote = { LETTERS: LETTERS, encode: encode, parse: parse, tokens: tokens, runoff: runoff };
})(typeof globalThis !== 'undefined' ? globalThis : this);
