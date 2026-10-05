// Vote page. Nothing leaves the browser. Only this device's own ranking draft is kept, and only if storage works.
(function () {
  'use strict';
  var core = window.StrVote;
  var form = document.getElementById('vote-rank');
  var dataNode = document.getElementById('vote-orders');
  if (!core || !form || !dataNode) return;

  var orders = JSON.parse(dataNode.textContent);
  var nameOf = {};
  orders.forEach(function (o) { nameOf[o.letter] = o.name; });
  var KEY = 'str-purpose-vote-draft-1';

  var selects = {};
  orders.forEach(function (o) { selects[o.letter] = document.getElementById('rank-' + o.letter); });
  var codeBox = document.getElementById('vote-code');
  var codeStatus = document.getElementById('vote-code-status');
  var yourOrder = document.getElementById('vote-your-order');
  var copyButton = document.getElementById('vote-copy');
  var clearButton = document.getElementById('vote-clear');
  var pasteBox = document.getElementById('vote-paste');
  var result = document.getElementById('vote-result');

  function readDraft() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && typeof saved === 'object') return saved;
    } catch (e) { /* storage may be blocked */ }
    return {};
  }
  function writeDraft() {
    var draft = {};
    orders.forEach(function (o) { draft[o.letter] = Number(selects[o.letter].value) || 0; });
    try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) { /* storage may be blocked */ }
  }
  function forgetDraft() {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage may be blocked */ }
  }

  function ranking() {
    var slots = [];
    orders.forEach(function (o) {
      var n = Number(selects[o.letter].value);
      if (n >= 1 && n <= orders.length) slots[n - 1] = o.letter;
    });
    return slots;
  }

  function showCode() {
    var slots = ranking();
    var filled = slots.filter(Boolean).length;
    if (filled === orders.length) {
      codeBox.value = core.encode(slots);
      codeStatus.textContent = 'Your code is ready. Paste it into the group chat.';
      yourOrder.textContent = 'Your order: ' + slots.map(function (l, i) { return (i + 1) + ' ' + nameOf[l]; }).join(', ') + '.';
      copyButton.disabled = false;
    } else {
      codeBox.value = '';
      codeStatus.textContent = 'Give each order its own number from 1 to ' + orders.length + '. ' + (orders.length - filled) + ' to go.';
      yourOrder.textContent = '';
      copyButton.disabled = true;
    }
  }

  function onRankChange(letter) {
    var chosen = selects[letter].value;
    if (chosen) {
      orders.forEach(function (o) {
        if (o.letter !== letter && selects[o.letter].value === chosen) selects[o.letter].value = '';
      });
    }
    writeDraft();
    showCode();
  }

  orders.forEach(function (o) {
    selects[o.letter].addEventListener('change', function () { onRankChange(o.letter); });
  });

  var saved = readDraft();
  var used = {};
  orders.forEach(function (o) {
    var n = Number(saved[o.letter]);
    if (n >= 1 && n <= orders.length && !used[n]) { selects[o.letter].value = String(n); used[n] = true; }
  });
  showCode();

  clearButton.addEventListener('click', function () {
    orders.forEach(function (o) { selects[o.letter].value = ''; });
    forgetDraft();
    showCode();
  });

  copyButton.addEventListener('click', function () {
    if (!codeBox.value) return;
    var done = function () { codeStatus.textContent = 'Copied. Paste it into the group chat.'; };
    var fallback = function () {
      codeBox.focus();
      codeBox.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) done(); else codeStatus.textContent = 'Select the code and copy it by hand.';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(codeBox.value).then(done, fallback);
    else fallback();
  });

  // Counting. Group choices at ties live only in memory and reset whenever the pasted codes change.
  var tieChoices = [];
  var lastPaste = null;

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function list(letters) {
    var names = letters.map(function (l) { return nameOf[l]; });
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function tally() {
    var text = pasteBox.value;
    if (text !== lastPaste) { tieChoices = []; lastPaste = text; }
    var found = core.tokens(text);
    if (!found.length) {
      result.innerHTML = '<p>' + (text.trim() ? 'No vote codes found. A code looks like V1-ABCDEF-0.' : 'Paste one to four codes to see the count.') + '</p>';
      return;
    }
    if (found.length > 4) {
      result.innerHTML = '<p>Found ' + found.length + ' codes. This counts at most four. Remove the extras.</p>';
      return;
    }
    var ballots = [];
    var problems = [];
    found.forEach(function (token, i) {
      var parsed = core.parse(token);
      if (parsed.ok) ballots.push(parsed.ranking);
      else problems.push('Code ' + (i + 1) + ' (' + esc(token) + '): ' + parsed.reason);
    });
    if (problems.length) {
      result.innerHTML = '<p>' + problems.join('</p><p>') + '</p><p>Fix the code and the count appears.</p>';
      return;
    }

    var outcome = core.runoff(ballots, tieChoices);
    var rows = outcome.rounds.map(function (round, i) {
      var order = round.remaining.slice().sort(function (a, b) { return round.counts[b] - round.counts[a] || a.localeCompare(b); });
      var votes = order.filter(function (l) { return round.counts[l] > 0; }).map(function (l) { return esc(nameOf[l]) + ' ' + round.counts[l]; }).join('. ') + '.';
      var what;
      if (round.winner) what = esc(nameOf[round.winner]) + ' has more than half of the codes. It wins.';
      else if (round.tied && round.chosen) what = 'Tie for fewest: ' + esc(list(round.tied)) + '. The group chose by coin flip or gut pick. ' + esc(nameOf[round.chosen]) + ' is out.';
      else if (round.tied) what = 'Tie for fewest: ' + esc(list(round.tied)) + '. Settle it with a coin flip or a group gut pick. Then choose who is out, below.';
      else if (round.out.length > 1) what = esc(list(round.out)) + ' have no first choices. They are out.';
      else what = esc(nameOf[round.out[0]]) + ' has the fewest. It is out.';
      return '<tr><th scope="row">Round ' + (i + 1) + '</th><td data-label="Votes">' + votes + '</td><td data-label="What happens">' + what + '</td></tr>';
    }).join('');

    var html = '<p>' + ballots.length + (ballots.length === 1 ? ' code' : ' codes') + ' counted. A winner needs more than half.</p>' +
      '<div class="d-wrap"><table class="d-grid cols-3"><thead><tr><th scope="col">Round</th><th scope="col">Votes</th><th scope="col">What happens</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    if (outcome.winner) {
      html += '<p class="d-vote-win"><strong>Result: ' + esc(nameOf[outcome.winner]) + '.</strong></p>';
    } else if (outcome.pending) {
      html += '<p>Who is out?</p><p class="d-vote-ties">' + outcome.pending.map(function (l) {
        return '<button type="button" class="d-linkbtn" data-out="' + l + '">' + esc(nameOf[l]) + ' is out</button>';
      }).join(' ') + '</p>';
    }
    if (tieChoices.length) html += '<p><button type="button" class="d-linkbtn" data-undo="1">Undo last choice</button></p>';
    result.innerHTML = html;
  }

  result.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    if (target.getAttribute('data-out')) {
      tieChoices.push(target.getAttribute('data-out'));
      tally();
    } else if (target.getAttribute('data-undo')) {
      tieChoices.pop();
      tally();
    }
  });
  pasteBox.addEventListener('input', tally);
  tally();
})();
