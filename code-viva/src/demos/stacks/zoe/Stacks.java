import java.util.Stack;

public class Stacks {
    public static boolean isBalanced(String s) {
        Stack<Character> st = new Stack<>();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(' || c == '[' || c == '{') st.push(c);
            if (c == ')' || c == ']' || c == '}') {
                if (st.empty()) return false;
                char t = st.pop();
                if (c == ')' && t != '(') return false;
                if (c == ']' && t != '[') return false;
                if (c == '}' && t != '{') return false;
            }
        }
        return st.empty();
    }

    public static int evalRpn(String expr) {
        Stack<Integer> st = new Stack<>();
        String[] p = expr.split(" ");
        for (String x2 : p) {
            if (x2.equals("+")) st.push(st.pop() + st.pop());
            else if (x2.equals("*")) st.push(st.pop() * st.pop());
            else if (x2.equals("-")) { int b = st.pop(); st.push(st.pop() - b); }
            else if (x2.equals("/")) { int b = st.pop(); st.push(st.pop() / b); }
            else st.push(Integer.parseInt(x2));
        }
        return st.pop();
    }
}
