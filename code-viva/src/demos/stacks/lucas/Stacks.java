import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;

public class Stacks {
    private static final Map<Character, Character> PAIRS = Map.of(')', '(', ']', '[', '}', '{');

    public static boolean isBalanced(String s) {
        Deque<Character> open = new ArrayDeque<>();
        for (char ch : s.toCharArray()) {
            if (ch == '(' || ch == '[' || ch == '{') {
                open.push(ch);
            } else if (PAIRS.containsKey(ch)) {
                if (open.isEmpty() || open.pop() != PAIRS.get(ch)) {
                    return false;
                }
            }
        }
        return open.isEmpty();
    }

    public static int evalRpn(String expr) {
        Deque<Integer> values = new ArrayDeque<>();
        for (String token : expr.trim().split("\\s+")) {
            if (token.matches("-?\\d+")) {
                values.push(Integer.parseInt(token));
                continue;
            }
            if (values.size() < 2) {
                throw new IllegalArgumentException("not enough operands for " + token);
            }
            int right = values.pop();
            int left = values.pop();
            switch (token) {
                case "+" -> values.push(left + right);
                case "-" -> values.push(left - right);
                case "*" -> values.push(left * right);
                case "/" -> values.push(left / right);
                default -> throw new IllegalArgumentException("unknown operator " + token);
            }
        }
        if (values.size() != 1) {
            throw new IllegalArgumentException("leftover operands");
        }
        return values.pop();
    }
}
